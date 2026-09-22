import path from 'path';
import { RepoScanner, RepoMetadata } from './analyzer/scanner';
import { ModuleResolver, DependencyGraph } from './analyzer/resolver';
import { GraphSlicer, FeatureSlice } from './analyzer/slicer';
import { EntryPointDetector, EntryCandidate } from './analyzer/detector';
import { ManifestGenerator, FeatureCatalog } from './semantic';

export class RepositoryIndexer {
  private targetDir: string;
  private catalog: FeatureCatalog;

  constructor(targetDir?: string) {
    if (!targetDir || typeof targetDir !== 'string') {
      throw new Error(`[Indexer] Invalid targetDirectory provided: ${targetDir}`);
    }
    this.targetDir = path.resolve(process.cwd(), targetDir);
    this.catalog = new FeatureCatalog();
  }

  public async run(): Promise<{ repositoryId: string; featureCount: number }> {
    console.log(`\n[Indexer] Starting indexing for: ${this.targetDir}`);

    const repoId = FeatureCatalog.generateRepoId(this.targetDir);
    const repoName = path.basename(this.targetDir) || 'unnamed-repo';

    // 1. Scan files and AST symbols
    console.log('[Indexer] Step 1/4: Scanning AST symbols...');
    const scanner = new RepoScanner(this.targetDir);
    const metadata: RepoMetadata = await scanner.scan();
    const fileCount = Object.keys(metadata.files || {}).length;

    // 2. Resolve module imports and external dependencies
    console.log('[Indexer] Step 2/4: Resolving module graph...');
    const graph: DependencyGraph = ModuleResolver.resolveGraph(metadata, this.targetDir);

    // 3. Detect candidate entry points
    console.log('[Indexer] Step 3/4: Detecting entry points...');
    const candidates: EntryCandidate[] = EntryPointDetector.findCandidates(graph);

    // Extract file paths from candidate objects
    const entryPoints: string[] =
      candidates.length > 0
        ? candidates.map((c) => c.filePath)
        : (graph.nodes || []).slice(0, 5);

    // 4. Slice features & generate manifests
    console.log(`[Indexer] Step 4/4: Slicing features (${entryPoints.length} candidates)...`);
    const slicer = new GraphSlicer(graph);
    const manifestGen = new ManifestGenerator();

    let featureCount = 0;
    for (const entryPoint of entryPoints) {
      if (!entryPoint) continue;
      
      try {
        // Use extractSlice instead of .slice()
        const slice: FeatureSlice = slicer.extractSlice(entryPoint);
        if (!slice || !slice.internalFiles || slice.internalFiles.length === 0) continue;

        const manifest = await manifestGen.generateManifest(slice, metadata);
        await this.catalog.indexFeature(repoId, manifest);
        featureCount++;
      } catch (err: any) {
        console.warn(`[Indexer] Could not process slice for "${entryPoint}": ${err?.message || err}`);
      }
    }

    // Register repository profile
    this.catalog.registerRepository({
      id: repoId,
      name: repoName,
      sourceUrl: this.targetDir,
      indexedAt: new Date().toISOString(),
      fileCount,
      featureCount,
    });

    console.log(`[Indexer] Completed. Indexed ${featureCount} features for repository [${repoId}].\n`);
    return { repositoryId: repoId, featureCount };
  }
}

// CLI Harness
const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && currentScript.endsWith('indexer.ts')) {
  const target = process.argv[2] || '.';
  const indexer = new RepositoryIndexer(target);
  indexer.run().catch(console.error);
}