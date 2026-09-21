import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { FeatureManifest } from '../semantic';
import { TreeShaker } from '../analyzer/tree-shaker';

// Require without strict TypeScript module resolution interference
const archiverModule = require('archiver');

/**
 * Robust instance creator that supports both Legacy (v5/v6) and Modern (v7+)
 * versions of the `archiver` package.
 */
function createZipArchive(options: any) {
  // Modern archiver (v7+) - directly exports the ZipArchive class
  if (archiverModule.ZipArchive) {
    return new archiverModule.ZipArchive(options);
  }
  if (archiverModule.default && archiverModule.default.ZipArchive) {
    return new archiverModule.default.ZipArchive(options);
  }

  // Legacy archiver (< v7) - exports a factory function
  if (typeof archiverModule === 'function') {
    return archiverModule('zip', options);
  }
  if (typeof archiverModule.create === 'function') {
    return archiverModule.create('zip', options);
  }
  if (archiverModule.default && typeof archiverModule.default === 'function') {
    return archiverModule.default('zip', options);
  }

  throw new Error('Could not instantiate ZipArchive. Unknown archiver package structure.');
}

export class FeatureArchiver {
  /**
   * Streams a zipped bundle of the sliced feature directly to an Express Response.
   */
  public static streamZip(
    manifest: FeatureManifest,
    sourceRoot: string,
    res: Response
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create the zip stream using the robust instantiator
      const archive = createZipArchive({ zlib: { level: 9 } });

      const safeName = manifest.featureName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Set download headers
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}.zip"`
      );

      archive.on('error', (err: any) => reject(err));
      archive.on('end', () => resolve());

      // Pipe archive stream directly into the HTTP response
      archive.pipe(res);

      const resolvedRoot = path.resolve(sourceRoot);
      const treeShaker = new TreeShaker();

      // Collect required symbols across manifest capabilities
      const requiredSymbols = new Set<string>(manifest.capabilities || []);

      // 1. Append internal source files (with symbol-level tree-shaking)
      for (const relativePath of manifest.files) {
        const fullSourcePath = path.isAbsolute(relativePath)
          ? relativePath
          : path.join(resolvedRoot, relativePath);

        if (fs.existsSync(fullSourcePath)) {
          const zipInternalPath = (
            path.isAbsolute(relativePath)
              ? path.relative(resolvedRoot, fullSourcePath)
              : relativePath
          ).replace(/\\/g, '/');

          const isTypeScript =
            relativePath.endsWith('.ts') ||
            relativePath.endsWith('.tsx') ||
            relativePath.endsWith('.js') ||
            relativePath.endsWith('.jsx');

          const isEntryPoint = manifest.entryPoints.includes(relativePath);

          // Keep entry point code intact; tree-shake intermediate dependencies
          if (isTypeScript && !isEntryPoint && requiredSymbols.size > 0) {
            try {
              const rawSource = fs.readFileSync(fullSourcePath, 'utf-8');
              const prunedCode = treeShaker.shakeFile(rawSource, requiredSymbols);
              archive.append(prunedCode, { name: zipInternalPath });
              continue;
            } catch {
              // Fall back to raw file if AST shaking encounters an error
            }
          }

          archive.file(fullSourcePath, { name: zipInternalPath });
        }
      }

      // 2. Synthesize & append standalone package.json
      const rootPkgPath = path.join(resolvedRoot, 'package.json');
      let rootDeps: Record<string, string> = {};

      if (fs.existsSync(rootPkgPath)) {
        try {
          const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
          rootDeps = {
            ...(rootPkg.dependencies || {}),
            ...(rootPkg.devDependencies || {}),
          };
        } catch {
          // Fallback to empty dependencies
        }
      }

      const extractedDeps: Record<string, string> = {};
      for (const dep of manifest.externalDependencies) {
        extractedDeps[dep] = rootDeps[dep] || 'latest';
      }

      const standalonePkg = {
        name: safeName,
        version: '1.0.0',
        description: manifest.summary,
        main: manifest.entryPoints[0] || 'index.js',
        scripts: {
          build: 'tsc',
        },
        dependencies: extractedDeps,
      };

      archive.append(JSON.stringify(standalonePkg, null, 2), {
        name: 'package.json',
      });

      // 3. Synthesize & append README.md
      const readmeContent = `
# ${manifest.featureName}

> Category: \`${manifest.category}\`

${manifest.summary}

## Entry Points
${manifest.entryPoints.map((ep) => `- \`${ep}\``).join('\n')}

## Capabilities
${manifest.capabilities.map((cap) => `- ${cap}`).join('\n')}

## External Dependencies
\`\`\`json
${JSON.stringify(extractedDeps, null, 2)}
\`\`\`

## Installation
\`\`\`bash
npm install
\`\`\`
`.trim();

      archive.append(readmeContent, { name: 'README.md' });

      // Finalize and close the archive stream
      archive.finalize();
    });
  }
}