import dotenv from 'dotenv';
import { FeatureSlice } from '../analyzer/slicer';
import { RepoMetadata } from '../analyzer/scanner';

dotenv.config();

export interface FeatureManifest {
  featureName: string;
  summary: string;
  category: string;
  entryPoints: string[];
  files: string[];
  capabilities: string[];
}

export class ManifestGenerator {
  private apiKey: string;
  private endpoint: string;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is missing from environment variables.');
    }
    this.apiKey = key;
    // Updated to the current active Gemini Flash model
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${this.apiKey}`;
  }

  public async generateManifest(
    slice: FeatureSlice,
    metadata: RepoMetadata,
    retries = 2
  ): Promise<FeatureManifest> {
    const internalFiles = slice.internalFiles || [];
    const entryPoint = slice.entryPoint;

    // Collect all exported symbols for the files in this slice
    const exportedSymbols: string[] = [];
    for (const file of internalFiles) {
      const fileMeta = metadata.files?.[file];
      if (fileMeta?.exports) {
        fileMeta.exports.forEach((e) => exportedSymbols.push(`${e.name} (${e.type})`));
      }
    }

    const prompt = `
You are an expert software cataloger. Analyze the following sliced code feature:
- Entry point: ${entryPoint}
- Internal files: ${internalFiles.join(', ')}
- Exported symbols: ${exportedSymbols.slice(0, 30).join(', ')}
- External dependencies: ${(slice.externalDependencies || []).join(', ')}

Respond ONLY with valid raw JSON in this exact structure without markdown fences:
{
  "featureName": "Descriptive feature name",
  "summary": "1-2 sentence description of what this slice does",
  "category": "utility | authentication | database | api | testing | core",
  "entryPoints": ["${entryPoint}"],
  "files": ${JSON.stringify(internalFiles)},
  "capabilities": ["capability 1", "capability 2"]
}
`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API error [${response.status}]: ${errText}`);
        }

        const data = await response.json();
        const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawContent) throw new Error('Empty response from Gemini');

        const cleanedJson = rawContent.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(cleanedJson);
        return {
          ...parsed,
          files: internalFiles,
          entryPoints: parsed.entryPoints || [entryPoint],
        };
      } catch (err: any) {
        if (attempt === retries) {
          console.warn(`[Manifest] Remote generation failed (${err?.message || err}). Using AST fallback.`);
          return this.generateFallbackManifest(slice, metadata);
        }
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }

    return this.generateFallbackManifest(slice, metadata);
  }

  private generateFallbackManifest(slice: FeatureSlice, metadata: RepoMetadata): FeatureManifest {
    const internalFiles = slice.internalFiles || [];
    const entryPoint = slice.entryPoint;
    const baseName = entryPoint.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'feature';
    const readableName = baseName
      .split(/[-_]/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');

    const capabilities: string[] = [];
    for (const file of internalFiles) {
      const fileMeta = metadata.files?.[file];
      if (fileMeta?.exports) {
        fileMeta.exports.forEach((e) => capabilities.push(`Exports ${e.name} (${e.type})`));
      }
    }

    return {
      featureName: `${readableName} Module`,
      summary: `Automated feature slice isolated from ${entryPoint} with ${internalFiles.length} file(s).`,
      category: entryPoint.includes('test') ? 'testing' : 'core',
      entryPoints: [entryPoint],
      files: internalFiles,
      capabilities: capabilities.length > 0 ? capabilities.slice(0, 5) : ['Modular code execution'],
    };
  }
}