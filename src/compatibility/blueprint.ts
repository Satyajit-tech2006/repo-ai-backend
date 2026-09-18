import dotenv from 'dotenv';
import { FeatureManifest } from '../semantic';
import { CompatibilityReport, TargetRepoProfile } from './checker';

dotenv.config();

export interface IntegrationBlueprint {
  steps: string[];
  requiredEnvVars: string[];
  adapterRecommendations: string[];
  integrationSnippet: string;
}

export class BlueprintGenerator {
  private endpoint: string;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not defined in .env');
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;
  }

  public async generateBlueprint(
    manifest: FeatureManifest,
    profile: TargetRepoProfile,
    report: CompatibilityReport
  ): Promise<IntegrationBlueprint> {
    const prompt = `
You are an expert software architect helping a developer integrate an extracted feature into a target repository.

Feature Name: ${manifest.featureName}
Feature Summary: ${manifest.summary}
Feature Files: ${manifest.files.join(', ')}
Feature External Dependencies: ${manifest.externalDependencies.join(', ')}

Target Environment:
- Framework: ${profile.framework}
- Database/ORM: ${profile.ormOrDriver}
- TypeScript: ${profile.isTypeScript}

Compatibility Analysis:
- Suitability Score: ${report.suitabilityScore}/100
- Detected Conflicts: ${report.conflicts.join('; ') || 'None'}
- Missing Dependencies to Install: ${report.missingDependencies.join(', ') || 'None'}

Provide a JSON object strictly matching this schema:
- "steps": array of strings (ordered step-by-step instructions to integrate this feature)
- "requiredEnvVars": array of strings (names of likely environment variables needed, e.g. "DATABASE_URL")
- "adapterRecommendations": array of strings (how to resolve any conflicts or missing layers)
- "integrationSnippet": string (a short TypeScript code example showing how to import and call the entry point)
`;

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
      const err = await response.text();
      throw new Error(`Gemini Blueprint Error [${response.status}]: ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Blueprint generation.');

    return JSON.parse(text) as IntegrationBlueprint;
  }
}