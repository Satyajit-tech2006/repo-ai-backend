import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';
import { FeatureSlice } from '../analyzer';

dotenv.config();

// Runtime validation schema using Zod
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
  private apiKey: string;
  private endpoint: string;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not defined in your .env file.');
    }
    this.apiKey = key;
    // Direct Gemini 2.5 Flash endpoint
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${this.apiKey}`;
  }

  public async generateManifest(slice: FeatureSlice): Promise<FeatureManifest> {
    // 1. Bundle only code files belonging to this slice
    let combinedCode = '';
    for (const file of slice.internalFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        combinedCode += `\n--- FILE: ${file} ---\n${content}\n`;
      }
    }

    const prompt = `
You are an expert software architect analyzing an extracted slice of a codebase.
Analyze the following code files and external dependencies belonging to a single feature slice.

Entry Point: ${slice.entryPoint}
External Dependencies: ${slice.externalDependencies.join(', ')}

Code:
${combinedCode}

Produce a concise, structured JSON object with these exact keys:
- "featureName": string (concise descriptive name)
- "category": string (e.g., "code_analysis", "developer_tools", "auth")
- "summary": string (2-3 sentences explaining purpose)
- "capabilities": array of strings (key capabilities)
`;

    // 2. Direct HTTP call with JSON output mode
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error [${response.status}]: ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Received empty response from Gemini API.');
    }

    const parsed = JSON.parse(candidateText);

    // 3. Assemble: deterministic facts from Slicer + semantic synthesis from LLM
    const fullManifest: FeatureManifest = {
      featureName: parsed.featureName,
      category: parsed.category,
      summary: parsed.summary,
      capabilities: parsed.capabilities,
      entryPoints: [slice.entryPoint],
      files: slice.internalFiles,
      externalDependencies: slice.externalDependencies,
    };

    // 4. Assert shape with Zod
    return FeatureManifestSchema.parse(fullManifest);
  }
}

// Verification runner
async function run() {
  if (!fs.existsSync('feature-slice.json')) {
    console.error('Run src/analyzer/slicer.ts first to produce feature-slice.json');
    process.exit(1);
  }

  const rawSlice = fs.readFileSync('feature-slice.json', 'utf-8');
  const slice: FeatureSlice = JSON.parse(rawSlice);

  console.log(`[Manifest] Synthesizing semantic manifest for: ${slice.entryPoint}...`);
  const generator = new ManifestGenerator();

  const startTime = Date.now();
  const manifest = await generator.generateManifest(slice);
  const elapsed = Date.now() - startTime;

  console.log(`\n[Manifest] Generated in ${elapsed}ms:`);
  console.log(JSON.stringify(manifest, null, 2));

  fs.writeFileSync('feature-manifest.json', JSON.stringify(manifest, null, 2));
  console.log('\n[Manifest] Written to feature-manifest.json');
}

const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && currentScript.endsWith('manifest.ts')) {
  run().catch(console.error);
}