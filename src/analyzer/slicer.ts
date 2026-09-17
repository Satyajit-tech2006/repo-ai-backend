import fs from 'fs';
import { DependencyGraph } from './resolver';

export interface FeatureSlice {
  entryPoint: string;
  internalFiles: string[];        // All files reachable from entryPoint
  externalDependencies: string[]; // All npm packages required by this slice
  fileCount: number;
}

export class GraphSlicer {
  private adjacencyList: Map<string, string[]> = new Map();
  private externalMap: Map<string, Set<string>> = new Map();

  constructor(private graph: DependencyGraph) {
    this.buildAdjacency();
  }

  private buildAdjacency(): void {
    // Initialize nodes
    for (const node of this.graph.nodes) {
      this.adjacencyList.set(node, []);
      this.externalMap.set(node, new Set());
    }

    // Populate internal edges
    for (const edge of this.graph.internalEdges) {
      const neighbors = this.adjacencyList.get(edge.from) || [];
      neighbors.push(edge.to);
      this.adjacencyList.set(edge.from, neighbors);
    }

    // Populate external dependencies per file
    for (const ext of this.graph.externalDependencies) {
      const set = this.externalMap.get(ext.from) || new Set();
      set.add(ext.pkgName);
      this.externalMap.set(ext.from, set);
    }
  }

  public extractSlice(entryFile: string): FeatureSlice {
    if (!this.adjacencyList.has(entryFile)) {
      throw new Error(`Entry file "${entryFile}" does not exist in graph.`);
    }

    const visited = new Set<string>();
    const queue: string[] = [entryFile];
    visited.add(entryFile);

    const requiredPackages = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Collect external dependencies for this file
      const pkgs = this.externalMap.get(current);
      if (pkgs) {
        pkgs.forEach((pkg) => requiredPackages.add(pkg));
      }

      // Traverse internal neighbors
      const neighbors = this.adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return {
      entryPoint: entryFile,
      internalFiles: Array.from(visited),
      externalDependencies: Array.from(requiredPackages),
      fileCount: visited.size,
    };
  }

  // Static helper to quickly slice a graph from an entry point
  public static slice(graph: DependencyGraph, entryFile: string): FeatureSlice {
    const slicer = new GraphSlicer(graph);
    return slicer.extractSlice(entryFile);
  }
}

// Verification Harness (guarded so it does not auto-run when imported)
function run() {
  if (!fs.existsSync('resolved-graph.json')) {
    console.error('Run src/analyzer/resolver.ts first to generate resolved-graph.json');
    process.exit(1);
  }

  const rawGraph = fs.readFileSync('resolved-graph.json', 'utf-8');
  const graph: DependencyGraph = JSON.parse(rawGraph);

  const slicer = new GraphSlicer(graph);
  const entry = graph.nodes[0];

  if (!entry) {
    console.error('No nodes available to slice.');
    return;
  }

  console.log(`[Slicer] Extracting feature slice starting from: ${entry}`);
  const slice = slicer.extractSlice(entry);

  console.log('\n--- Extracted Feature Slice ---');
  console.log(JSON.stringify(slice, null, 2));

  fs.writeFileSync('feature-slice.json', JSON.stringify(slice, null, 2));
}

const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && currentScript.endsWith('slicer.ts')) {
  run();
}