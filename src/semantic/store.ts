import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FeatureManifest } from './manifest';
import { VectorEmbedder } from './embedder';
import { RepositoryRecord, PartitionedFeature } from './types';

export class FeatureCatalog {
  private static readonly DATA_DIR = 'catalog_data';
  private static readonly REPOS_FILE = path.join(FeatureCatalog.DATA_DIR, 'repositories.json');
  private static readonly FEATURES_FILE = path.join(FeatureCatalog.DATA_DIR, 'features.json');

  private embedder: VectorEmbedder;
  private repositories: Map<string, RepositoryRecord> = new Map();
  private features: PartitionedFeature[] = [];

  constructor() {
    this.embedder = new VectorEmbedder();
    this.initStorage();
    this.load();
  }

  private initStorage(): void {
    if (!fs.existsSync(FeatureCatalog.DATA_DIR)) {
      fs.mkdirSync(FeatureCatalog.DATA_DIR, { recursive: true });
    }
  }

  private load(): void {
    if (fs.existsSync(FeatureCatalog.REPOS_FILE)) {
      try {
        const raw = fs.readFileSync(FeatureCatalog.REPOS_FILE, 'utf-8');
        const repos: RepositoryRecord[] = JSON.parse(raw);
        this.repositories = new Map(repos.map((r) => [r.id, r]));
      } catch {
        this.repositories = new Map();
      }
    }

    if (fs.existsSync(FeatureCatalog.FEATURES_FILE)) {
      try {
        const raw = fs.readFileSync(FeatureCatalog.FEATURES_FILE, 'utf-8');
        this.features = JSON.parse(raw);
      } catch {
        this.features = [];
      }
    }
  }

  private save(): void {
    fs.writeFileSync(
      FeatureCatalog.REPOS_FILE,
      JSON.stringify(Array.from(this.repositories.values()), null, 2)
    );
    fs.writeFileSync(FeatureCatalog.FEATURES_FILE, JSON.stringify(this.features, null, 2));
  }

  /**
   * Generates a deterministic repository ID from a git URL or local path.
   */
  public static generateRepoId(sourcePathOrUrl: string): string {
    return crypto
      .createHash('sha256')
      .update(sourcePathOrUrl.trim().toLowerCase())
      .digest('hex')
      .slice(0, 16);
  }

  public registerRepository(repo: RepositoryRecord): void {
    this.load();
    this.repositories.set(repo.id, repo);
    this.save();
  }

  public getRepositories(): RepositoryRecord[] {
    this.load();
    return Array.from(this.repositories.values());
  }

  public getRepository(repoId: string): RepositoryRecord | undefined {
    this.load();
    return this.repositories.get(repoId);
  }

  /**
   * Indexes a feature scoped to a specific repository.
   */
  public async indexFeature(repositoryId: string, manifest: FeatureManifest): Promise<void> {
    const searchText = `
      Name: ${manifest.featureName}
      Category: ${manifest.category}
      Summary: ${manifest.summary}
      Capabilities: ${manifest.capabilities.join(', ')}
    `.trim();

    console.log(`[Store] Embedding feature: "${manifest.featureName}" (Repo: ${repositoryId})...`);
    const embedding = await this.embedder.embed(searchText);

    // Replace if existing in the same repository partition, otherwise append
    const existingIndex = this.features.findIndex(
      (f) => f.repositoryId === repositoryId && f.manifest.featureName === manifest.featureName
    );

    const record: PartitionedFeature = { repositoryId, manifest, embedding };

    if (existingIndex >= 0) {
      this.features[existingIndex] = record;
    } else {
      this.features.push(record);
    }

    this.save();
  }

  /**
   * Searches features across all repositories or constrained to a specific repositoryId.
   */
  public async search(
    query: string,
    options?: { repositoryId?: string; topK?: number }
  ): Promise<Array<{ manifest: FeatureManifest; repositoryId: string; score: number }>> {
    this.load();
    const topK = options?.topK ?? 5;
    const filterRepoId = options?.repositoryId;

    let targetFeatures = this.features;
    if (filterRepoId) {
      targetFeatures = targetFeatures.filter((f) => f.repositoryId === filterRepoId);
    }

    if (targetFeatures.length === 0) return [];

    try {
      const queryVector = await this.embedder.embed(query);

      const scored = targetFeatures.map((entry) => ({
        manifest: entry.manifest,
        repositoryId: entry.repositoryId,
        score: VectorEmbedder.cosineSimilarity(queryVector, entry.embedding),
      }));

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    } catch {
      // Lexical fallback
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

      const scored = targetFeatures.map((entry) => {
        const m = entry.manifest;
        const targetText = [m.featureName, m.summary, m.category, ...m.capabilities]
          .join(' ')
          .toLowerCase();

        let matches = 0;
        for (const token of tokens) {
          if (targetText.includes(token)) matches++;
        }

        const score = tokens.length > 0 ? matches / tokens.length : 0.5;
        return { manifest: m, repositoryId: entry.repositoryId, score };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    }
  }
}