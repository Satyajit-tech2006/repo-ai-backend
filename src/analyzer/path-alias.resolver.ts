import fs from 'fs';
import path from 'path';

export interface PathAliasConfig {
  baseUrl: string;
  paths: Record<string, string[]>;
}

export class PathAliasResolver {
  private config: PathAliasConfig | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.loadConfig();
  }

  private loadConfig(): void {
    const candidateFiles = ['tsconfig.json', 'jsconfig.json'];

    for (const file of candidateFiles) {
      const configPath = path.join(this.projectRoot, file);
      if (fs.existsSync(configPath)) {
        try {
          const rawContent = fs.readFileSync(configPath, 'utf-8');
          // Strip single-line and multi-line comments
          const cleanJson = rawContent
            .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
            .trim();

          const parsed = JSON.parse(cleanJson);
          const compilerOptions = parsed.compilerOptions || {};

          if (compilerOptions.paths) {
            this.config = {
              baseUrl: compilerOptions.baseUrl
                ? path.resolve(this.projectRoot, compilerOptions.baseUrl)
                : this.projectRoot,
              paths: compilerOptions.paths,
            };
            return;
          }
        } catch {
          // Ignore unparseable configs and proceed
        }
      }
    }
  }

  /**
   * Resolves an import specifier (e.g. '@/utils/logger') using tsconfig paths.
   */
  public resolveAlias(importSpecifier: string): string | null {
    if (!this.config) return null;

    const { baseUrl, paths } = this.config;

    for (const [aliasPattern, targetPatterns] of Object.entries(paths)) {
      // 1. Exact match (e.g. "@utils": ["src/utils/index.ts"])
      if (aliasPattern === importSpecifier) {
        for (const target of targetPatterns) {
          const candidate = path.resolve(baseUrl, target);
          const resolved = this.tryExtensions(candidate);
          if (resolved) return resolved;
        }
      }

      // 2. Wildcard match (e.g. "@/*": ["src/*"])
      if (aliasPattern.endsWith('/*')) {
        const prefix = aliasPattern.slice(0, -1); // e.g. "@/"
        if (importSpecifier.startsWith(prefix)) {
          const suffix = importSpecifier.slice(prefix.length); // remainder after "@/"

          for (const target of targetPatterns) {
            const targetPrefix = target.slice(0, -1); // e.g. "src/"
            const candidate = path.resolve(baseUrl, targetPrefix + suffix);
            const resolved = this.tryExtensions(candidate);
            if (resolved) return resolved;
          }
        }
      }
    }

    return null;
  }

  private tryExtensions(basePath: string): string | null {
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
    for (const ext of extensions) {
      const full = basePath + ext;
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return full;
      }
    }
    return null;
  }
}

export default PathAliasResolver;