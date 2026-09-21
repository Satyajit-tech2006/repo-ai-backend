import fs from 'fs';
import path from 'path';
import { isBuiltin } from 'module';
import { RepoMetadata } from './scanner';
import * as PathAliasModule from './path-alias.resolver';

const PathAliasResolver =
  (PathAliasModule as any).PathAliasResolver ||
  (PathAliasModule as any).default?.PathAliasResolver ||
  (PathAliasModule as any).default;

export interface ResolvedEdge {
  from: string;               // Source file relative path, e.g. "src/scanner.ts"
  to: string;                 // Target file relative path, e.g. "src/parser.ts"
  importedSymbols: string[];  // e.g. ["CodeParser", "FileSymbols"]
}

export interface ExternalDependency {
  from: string;
  pkgName: string;
}

export interface DependencyGraph {
  nodes: string[];                             // List of all file paths in the repo
  internalEdges: ResolvedEdge[];               // Internal file -> file links
  externalDependencies: ExternalDependency[]; // file -> npm package links
  unresolvedImports: Array<{ from: string; source: string }>;
}

export class ModuleResolver {
  private static readonly EXTENSIONS = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '/index.ts',
    '/index.tsx',
    '/index.js',
  ];

  public static resolveGraph(metadata: RepoMetadata, rootDirectory?: string): DependencyGraph {
    const rootPath = rootDirectory ? path.resolve(rootDirectory).replace(/\\/g, '/') : metadata.rootPath;
    const knownFiles = new Set(Object.keys(metadata.files));
    const aliasResolver = new PathAliasResolver(rootPath);

    const graph: DependencyGraph = {
      nodes: Array.from(knownFiles),
      internalEdges: [],
      externalDependencies: [],
      unresolvedImports: [],
    };

    for (const [filePath, symbols] of Object.entries(metadata.files)) {
      const fileDir = path.dirname(path.join(rootPath, filePath));

      for (const imp of symbols.imports) {
        const rawSource = imp.source;
        const importedNames = imp.specifiers.map((s) => s.name);

        let resolvedRelative: string | null = null;

        // 1. Check Path Aliases first (@/*, ~/*) via tsconfig/jsconfig
        const aliasedSystemPath = aliasResolver.resolveAlias(rawSource);
        if (aliasedSystemPath) {
          const candidateRel = path.relative(rootPath, aliasedSystemPath).replace(/\\/g, '/');
          if (knownFiles.has(candidateRel)) {
            resolvedRelative = candidateRel;
          }
        }

        // 2. Relative Imports (./ or ../)
        if (!resolvedRelative && (rawSource.startsWith('.') || rawSource.startsWith('/'))) {
          const resolvedBase = path.resolve(fileDir, rawSource);
          const directRel = path.relative(rootPath, resolvedBase).replace(/\\/g, '/');

          if (knownFiles.has(directRel)) {
            resolvedRelative = directRel;
          } else {
            for (const ext of this.EXTENSIONS) {
              const probePath = path.relative(rootPath, resolvedBase + ext).replace(/\\/g, '/');
              if (knownFiles.has(probePath)) {
                resolvedRelative = probePath;
                break;
              }
            }
          }
        }

        // 3. Register Edge or classify as External Dependency
        if (resolvedRelative) {
          graph.internalEdges.push({
            from: filePath,
            to: resolvedRelative,
            importedSymbols: importedNames,
          });
        } else if (!rawSource.startsWith('.') && !rawSource.startsWith('/')) {
          // External package (e.g. "express", "fs", "node:path", "@google/genai")
          const pkgParts = rawSource.split('/');
          const pkgName = rawSource.startsWith('@') && pkgParts.length > 1
            ? `${pkgParts[0]}/${pkgParts[1]}`
            : pkgParts[0];

          // Filter out Node.js native built-ins so they do not pollute package.json
          const cleanPkgName = pkgName.startsWith('node:') ? pkgName.slice(5) : pkgName;
          if (!isBuiltin(cleanPkgName)) {
            graph.externalDependencies.push({
              from: filePath,
              pkgName,
            });
          }
        } else {
          // Relative path that failed to resolve
          graph.unresolvedImports.push({
            from: filePath,
            source: rawSource,
          });
        }
      }
    }

    return graph;
  }
}

// Verification Harness (guarded so it does not auto-run when imported)
async function run() {
  if (!fs.existsSync('repo-graph.json')) {
    console.error('Run src/scanner.ts first to generate repo-graph.json');
    process.exit(1);
  }

  const raw = fs.readFileSync('repo-graph.json', 'utf-8');
  const metadata: RepoMetadata = JSON.parse(raw);

  const graph = ModuleResolver.resolveGraph(metadata);

  console.log('\n--- Resolved Dependency Graph ---');
  console.log(JSON.stringify(graph, null, 2));

  fs.writeFileSync('resolved-graph.json', JSON.stringify(graph, null, 2));
  console.log('\n[Resolver] Emitted graph to resolved-graph.json');
}

const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && currentScript.endsWith('resolver.ts')) {
  run().catch(console.error);
}