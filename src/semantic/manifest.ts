import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';
import { FeatureSlice } from '../analyzer';

dotenv.config();

export const FeatureManifestSchema = z.object({
  featureName: z.string(),
  category: z.string(),
  summary: z.string(),
  capabilities: z.array(z.string()),
  entryPoints: z.array(z.string()),
  files: z.array(z.string()),
  externalDependencies: z.array(z.string()),
});

export type FeatureManifest = z.infer<typeof FeatureManifestSchema>;

export class ManifestGenerator {
  private endpoint: string;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not defined in .env');
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  }

  private async fetchWithRetry(body: string, retries = 3, delay = 2000): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (response.ok) {
        return response.json();
      }

      if ((response.status === 503 || response.status === 429) && attempt < retries) {
        console.warn(`[Gemini API ${response.status}] High demand/rate limit. Retrying attempt ${attempt + 1} in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      const err = await response.text();
      throw new Error(`Gemini API error [${response.status}]: ${err}`);
    }
  }

  public async generateManifest(slice: FeatureSlice): Promise<FeatureManifest> {
    const fileSnippets = slice.internalFiles.slice(0, 5).map((filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return `// File: ${filePath}\n${content.slice(0, 1500)}`;
      } catch {
        return `// File: ${filePath} (unavailable)`;
      }
    }).join('\n\n');

    const prompt = `
Analyze this feature slice extracted from a repository:
Entry Point: ${slice.entryPoint}
Files Involved: ${slice.internalFiles.join(', ')}
External Dependencies: ${slice.externalDependencies.join(', ')}

Code Samples:
${fileSnippets}

Respond with a JSON object strictly matching this schema:
- "featureName": string
- "category": string (e.g. auth, payments, database, code_analysis, developer_tools)
- "summary": string (1-2 sentences explaining what this feature does)
- "capabilities": array of strings
- "entryPoints": array of strings
- "files": array of strings
- "externalDependencies": array of strings
`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const data = await this.fetchWithRetry(body);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini.');

    const parsed = JSON.parse(text);
    return FeatureManifestSchema.parse({
      ...parsed,
      entryPoints: parsed.entryPoints || [slice.entryPoint],
      files: slice.internalFiles,
      externalDependencies: slice.externalDependencies,
    });
  }
}

// Verification Harness
async function run() {
  const slice: FeatureSlice = {
    entryPoint: 'src/analyzer/scanner.ts',
    internalFiles: ['src/analyzer/scanner.ts', 'src/analyzer/parser.ts'],
    externalDependencies: ['fs', 'path', 'fast-glob', 'tree-sitter'],
    fileCount: 2,
  };
  const generator = new ManifestGenerator();
  const manifest = await generator.generateManifest(slice);
  console.log(JSON.stringify(manifest, null, 2));
}

const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && currentScript.endsWith('src/semantic/manifest.ts')) {
  run().catch(console.error);
}