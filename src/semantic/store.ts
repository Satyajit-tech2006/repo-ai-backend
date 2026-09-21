import fs from 'fs';
import { FeatureManifest } from './manifest';
import { VectorEmbedder } from './embedder';

export interface IndexedFeature {
  manifest: FeatureManifest;
  embedding: number[];
}

export class FeatureCatalog {
  private static readonly DB_PATH = 'feature-catalog.json';
  private embedder: VectorEmbedder;
  private entries: IndexedFeature[] = [];

  constructor() {
    this.embedder = new VectorEmbedder();
    this.load();
  }

  private load(): void {
    if (fs.existsSync(FeatureCatalog.DB_PATH)) {
      const data = fs.readFileSync(FeatureCatalog.DB_PATH, 'utf-8');
      try {
        this.entries = JSON.parse(data);
      } catch {
        this.entries = [];
      }
    }
  }

  private save(): void {
    fs.writeFileSync(FeatureCatalog.DB_PATH, JSON.stringify(this.entries, null, 2));
  }

  public getAll(): FeatureManifest[] {
    this.load();
    return this.entries.map((f) => f.manifest);
  }

  public async indexFeature(manifest: FeatureManifest): Promise<void> {
    const searchText = `
      Name: ${manifest.featureName}
      Category: ${manifest.category}
      Summary: ${manifest.summary}
      Capabilities: ${manifest.capabilities.join(', ')}
    `.trim();

    console.log(`[Store] Embedding feature: "${manifest.featureName}"...`);
    const embedding = await this.embedder.embed(searchText);

    const existingIdx = this.entries.findIndex(
      (e) => e.manifest.featureName === manifest.featureName
    );

    if (existingIdx >= 0) {
      this.entries[existingIdx] = { manifest, embedding };
    } else {
      this.entries.push({ manifest, embedding });
    }

    this.save();
    console.log(`[Store] Successfully indexed "${manifest.featureName}".`);
  }

  public async search(query: string, topK = 3): Promise<Array<{ manifest: FeatureManifest; score: number }>> {
    this.load();
    if (this.entries.length === 0) return [];

    console.log(`[Store] Searching for: "${query}"...`);

    // 1. Attempt Vector Similarity Search
    try {
      const queryVector = await this.embedder.embed(query);

      const scored = this.entries.map((entry) => ({
        manifest: entry.manifest,
        score: VectorEmbedder.cosineSimilarity(queryVector, entry.embedding),
      }));

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    } catch (err: any) {
      console.warn(
        `[Store] Remote embedding search failed (${err?.message || 'Network Timeout'}). Falling back to lexical keyword search.`
      );

      // 2. Resilient Fallback: Lexical Token Search
      const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);

      const scored = this.entries.map((entry) => {
        const m = entry.manifest;
        const targetText = [
          m.featureName,
          m.summary,
          m.category,
          ...m.capabilities,
          ...m.files,
        ]
          .join(' ')
          .toLowerCase();

        let matchCount = 0;
        for (const token of queryTokens) {
          if (targetText.includes(token)) {
            matchCount++;
          }
        }

        const score = queryTokens.length > 0 ? matchCount / queryTokens.length : 0.5;
        return { manifest: m, score };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    }
  }
}

// Verification Harness
async function run() {
  if (!fs.existsSync('feature-manifest.json')) {
    console.error('Run src/semantic/manifest.ts first to generate feature-manifest.json');
    process.exit(1);
  }

  const manifest: FeatureManifest = JSON.parse(
    fs.readFileSync('feature-manifest.json', 'utf-8')
  );

  const catalog = new FeatureCatalog();

  // 1. Index the manifest
  await catalog.indexFeature(manifest);

  // 2. Perform a test search with an organic query
  const query = 'I need code that scans a project and creates syntax trees';
  const results = await catalog.search(query, 1);

  console.log('\n--- Search Result ---');
  console.log(`Match Score: ${(results[0].score * 100).toFixed(2)}%`);
  console.log(`Found Feature: ${results[0].manifest.featureName}`);
  console.log(`Summary: ${results[0].manifest.summary}`);
  console.log(`Files to copy:`, results[0].manifest.files);
}

const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && currentScript.endsWith('store.ts')) {
  run().catch(console.error);
}