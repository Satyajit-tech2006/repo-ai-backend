import dotenv from 'dotenv';
import { FeatureManifest } from '../semantic';
import { CompatibilityReport } from './checker';

dotenv.config();

export class BlueprintGenerator {
  private apiKey: string;
  private endpoint: string;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is missing from .env');
    }
    this.apiKey = key;
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${this.apiKey}`;
  }
  public async generateBlueprint(
    manifest: FeatureManifest,
    report: CompatibilityReport,
    retries = 3
  ): Promise<string> {
    const prompt = `
You are an expert software architect. Generate a concise, production-ready integration blueprint in Markdown.
Target Environment Compatibility:
- Compatible: ${(report as any)?.compatible ?? true}
- Missing Dependencies to Install: ${JSON.stringify((report as any)?.missingDependencies ?? [])}
- Potential File Overwrites: ${JSON.stringify((report as any)?.potentialCollisions ?? [])}

Feature Details:
- Name: ${manifest?.featureName ?? 'Feature'}
- Summary: ${manifest?.summary ?? ''}
- Entry Points: ${(manifest?.entryPoints ?? []).join(', ')}
- Capabilities: ${(manifest?.capabilities ?? []).join(', ')}

Provide:
1. Architectural integration overview.
2. Exact shell commands to install missing dependencies.
3. Recommended import statements and example usage wiring up the feature entry points.
`;

    // Attempt Gemini call with retry loop for 503 / 429
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

        if (response.status === 503 || response.status === 429) {
          if (attempt < retries) {
            const delay = attempt * 1500;
            console.warn(`[Blueprint] Gemini API ${response.status}. Retrying in ${delay}ms (attempt ${attempt}/${retries})...`);
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }
        }

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Gemini Blueprint Error [${response.status}]: ${err}`);
        }

        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return candidateText.trim();
        }
      } catch (err: any) {
        if (attempt === retries) {
          console.warn(`[Blueprint] Remote blueprint generation failed (${err?.message || err}). Serving deterministic fallback blueprint.`);
          return this.generateFallbackBlueprint(manifest, report);
        }
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }

    return this.generateFallbackBlueprint(manifest, report);
  }

  /**
   * Deterministic offline blueprint synthesized directly from AST metadata.
   */
  private generateFallbackBlueprint(manifest: FeatureManifest, report: CompatibilityReport): string {
    const rawMissing = (report as any)?.missingDependencies ?? (report as any)?.missingDeps ?? [];
    const rawCollisions = (report as any)?.potentialCollisions ?? (report as any)?.collisions ?? [];
    const files = manifest?.files ?? [];
    const entryPoints = manifest?.entryPoints ?? [];
    const capabilities = manifest?.capabilities ?? [];

    // Safely extract package names whether strings or objects { pkgName: '...' }
    const missingPkgs: string[] = Array.isArray(rawMissing)
      ? rawMissing.map((d: any) => (typeof d === 'string' ? d : d?.pkgName || String(d)))
      : [];

    const collisions: string[] = Array.isArray(rawCollisions)
      ? rawCollisions.map((c: any) => String(c))
      : [];

    const installCmd = missingPkgs.length > 0
      ? `npm install ${missingPkgs.join(' ')}`
      : `# All external dependencies already present`;

    const collisionWarning = collisions.length > 0
      ? `### Warning: Overwriting Files\nThe following files will collide with existing paths in the target repository:\n${collisions.map((f) => `- \`${f}\``).join('\n')}\n\n`
      : '';

    const primaryEntry = entryPoints[0] || files[0] || 'index';

    return `
# Integration Blueprint: ${manifest?.featureName ?? 'Extracted Feature'}

> Note: Synthesized via offline AST analysis engine.

## Overview
${manifest?.summary ?? 'Modular code feature extracted via Repo AI.'}

## 1. Install Required Dependencies
Run the following command in the target project root:
\`\`\`bash
${installCmd}
\`\`\`

${collisionWarning}## 2. Integrated Files
The sliced feature consists of the following modules:
${files.map((file) => `- \`${file}\``).join('\n')}

## 3. Recommended Import & Usage
Import the feature using its detected primary entry point:
\`\`\`typescript
// Import from feature entry point
import * as FeatureModule from './${primaryEntry}';

// Available capabilities:
${capabilities.map((c) => `// - ${c}`).join('\n')}
\`\`\`
`.trim();
  }
}