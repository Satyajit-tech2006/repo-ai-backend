import path from 'path';
import { RepoScanner, ModuleResolver, GraphSlicer, EntryPointDetector } from './analyzer';
import { ManifestGenerator, FeatureCatalog } from './semantic';

export class RepositoryIndexer {
  private targetRepoPath: string;

  constructor(targetRepoPath: string) {
    this.targetRepoPath = path.resolve(targetRepoPath);
  }

  public async run(): Promise<void> {
    console.log(`\n==============================================`);
    console.log(`[Repo AI] Indexing Repository: ${this.targetRepoPath}`);
    console.log(`==============================================\n`);

    // 1. Instantiate scanner and scan target repo
    console.log(`[Phase 1] Scanning ASTs & Resolving Dependency Graph...`);
    const scanner = new RepoScanner();
    const metadata = await scanner.scan(this.targetRepoPath);
    const graph = ModuleResolver.resolveGraph(metadata, this.targetRepoPath);

    // 2. Detect Entry Point Candidates
    console.log(`\n[Phase 2] Detecting Domain Entry Points...`);
    const candidates = EntryPointDetector.findCandidates(graph);
    console.log(`Found ${candidates.length} potential entry point candidate(s).`);

    // 3. Slice each candidate
    const rawSlices = candidates.map((candidate) =>
      GraphSlicer.slice(graph, candidate.filePath)
    );

    // 4. Deduplicate overlapping subgraphs
    const featureSlices = EntryPointDetector.deduplicateSlices(rawSlices);
    console.log(`Filtered down to ${featureSlices.length} distinct feature slice(s).\n`);

    // 5. Generate Manifests & Vector Embeddings
    const manifestGen = new ManifestGenerator();
    const catalog = new FeatureCatalog();

    for (let i = 0; i < featureSlices.length; i++) {
      const slice = featureSlices[i];
      console.log(`--- [${i + 1}/${featureSlices.length}] Processing: ${slice.entryPoint} ---`);
      console.log(`Files involved (${slice.internalFiles.length}):`, slice.internalFiles);

      try {
        const manifest = await manifestGen.generateManifest(slice);
        await catalog.indexFeature(manifest);
        console.log(`✓ Indexed: "${manifest.featureName}" (${manifest.category})\n`);
      } catch (err: any) {
        console.error(`✗ Failed to index ${slice.entryPoint}:`, err.message);
      }
    }

    console.log(`==============================================`);
    console.log(`Catalog generation complete. Stored in feature-catalog.json`);
    console.log(`==============================================\n`);
  }
}

// Only execute if called directly via CLI
const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && (currentScript.endsWith('src/indexer.ts') || currentScript.endsWith('indexer.ts'))) {
  const target = process.argv[2] || '.';
  const indexer = new RepositoryIndexer(target);
  indexer.run().catch(console.error);
}