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
    // Guard against undefined rootPath
    const resolvedRoot = rootDirectory || metadata?.rootPath || process.cwd();
    const rootPath = path.resolve(resolvedRoot).replace(/\\/g, '/');

    const filesDict = metadata?.files || {};
    const knownFiles = new Set(Object.keys(filesDict));

    let aliasResolver: any = null;
    try {
      aliasResolver = new PathAliasResolver(rootPath);
    } catch {
      aliasResolver = null;
    }

    const graph: DependencyGraph = {
      nodes: Array.from(knownFiles),
      internalEdges: [],
      externalDependencies: [],
      unresolvedImports: [],
    };

    for (const [filePath, symbols] of Object.entries(filesDict)) {
      if (!filePath || !symbols) continue;

      const fullSourceFile = path.resolve(rootPath, filePath);
      const fileDir = path.dirname(fullSourceFile);

      for (const imp of symbols.imports || []) {
        const rawSource = imp.source;
        if (!rawSource) continue;

        const importedNames = (imp.specifiers || []).map((s: any) => s.name);
        let resolvedRelative: string | null = null;

        // 1. Check Path Aliases first (@/*, ~/*) via tsconfig/jsconfig
        if (aliasResolver && typeof aliasResolver.resolveAlias === 'function') {
          try {
            const aliasedSystemPath = aliasResolver.resolveAlias(rawSource);
            if (aliasedSystemPath) {
              const candidateRel = path.relative(rootPath, aliasedSystemPath).replace(/\\/g, '/');
              if (knownFiles.has(candidateRel)) {
                resolvedRelative = candidateRel;
              }
            }
          } catch {
            // Ignore alias resolution failure
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
          const pkgParts = rawSource.split('/');
          const pkgName =
            rawSource.startsWith('@') && pkgParts.length > 1
              ? `${pkgParts[0]}/${pkgParts[1]}`
              : pkgParts[0];

          const cleanPkgName = pkgName.startsWith('node:') ? pkgName.slice(5) : pkgName;
          if (!isBuiltin(cleanPkgName)) {
            graph.externalDependencies.push({
              from: filePath,
              pkgName,
            });
          }
        } else {
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