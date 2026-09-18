import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { CodeParser, FileSymbols } from './parser';

export interface RepoMetadata {
  rootPath: string;
  totalFiles: number;
  files: Record<string, FileSymbols>;
}

export class RepoScanner {
  private parser: CodeParser;

  constructor() {
    this.parser = new CodeParser();
  }

  public async scan(targetDirectory: string): Promise<RepoMetadata> {
    // Normalize Windows backslashes to forward slashes for fast-glob compatibility
    const absoluteRoot = path.resolve(targetDirectory).replace(/\\/g, '/');

    const rawEntries = await fg(['**/*.{ts,js,tsx,jsx}'], {
      cwd: absoluteRoot,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/*.d.ts',
      ],
      dot: false,
    });

    const entries = rawEntries.map((p) => p.replace(/\\/g, '/'));

    const metadata: RepoMetadata = {
      rootPath: absoluteRoot,
      totalFiles: entries.length,
      files: {},
    };

    for (const relativePath of entries) {
      const fullPath = path.posix.join(absoluteRoot, relativePath);
      try {
        const sourceCode = fs.readFileSync(fullPath, 'utf-8');
        metadata.files[relativePath] = this.parser.parseSource(sourceCode);
      } catch (err) {
        console.warn(`[WARN] Skipping file: ${relativePath}`, err);
      }
    }

    return metadata;
  }
}

// CLI Execution Harness (guarded so it only runs when directly invoked)
async function main() {
  const targetDir = process.argv[2] || '.';
  
  const scanner = new RepoScanner();
  const startTime = Date.now();
  const result = await scanner.scan(targetDir);
  const elapsed = Date.now() - startTime;

  console.log(`\n[Scanner] Parsed ${result.totalFiles} files in ${elapsed}ms.`);
  fs.writeFileSync('repo-graph.json', JSON.stringify(result, null, 2));
  console.log(`[Scanner] Emitted metadata to repo-graph.json`);
}

const currentScript = process.argv[1]?.replace(/\\/g, '/');
if (currentScript && currentScript.endsWith('scanner.ts')) {
  main().catch((err) => {
    console.error('[FATAL ERROR]:', err);
  });
}