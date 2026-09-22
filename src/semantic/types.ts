import { FeatureManifest } from './manifest';

export interface RepositoryRecord {
  id: string;              // Normalized hash or slug, e.g. "github-sindresorhus-is"
  name: string;            // Display name
  sourceUrl?: string;      // Git URL or local folder path
  indexedAt: string;       // ISO timestamp
  fileCount: number;
  featureCount: number;
}

export interface PartitionedFeature {
  repositoryId: string;
  manifest: FeatureManifest;
  embedding: number[];
}