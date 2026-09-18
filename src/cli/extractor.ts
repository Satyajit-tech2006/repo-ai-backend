import fs from 'fs';
import path from 'path';
import { FeatureManifest } from '../semantic'; // Updated path

export class FeatureExtractor {
  public static extract(
    manifest: FeatureManifest,
    sourceRoot: string,
    outputDirectory: string
  ): void {
    const targetDir = path.resolve(outputDirectory);
    console.log(`\n[Extractor] Extracting "${manifest.featureName}" to: ${targetDir}`);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Copy internal files and preserve directory structure
    for (const relFile of manifest.files) {
      const srcPath = path.resolve(sourceRoot, relFile);
      const destPath = path.resolve(targetDir, relFile);

      if (!fs.existsSync(srcPath)) {
        console.warn(`[WARN] File not found at source: ${srcPath}`);
        continue;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      console.log(`  → Copied: ${relFile}`);
    }

    // 2. Read original package.json to grab exact versions
    const rootPkgPath = path.resolve(sourceRoot, 'package.json');
    let rootDeps: Record<string, string> = {};
    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
      rootDeps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
    }

    // 3. Filter Node built-ins and synthesize a new package.json
    const nodeBuiltins = new Set(['fs', 'path', 'os', 'crypto', 'http', 'https', 'stream', 'util', 'events']);
    const standaloneDeps: Record<string, string> = {};

    for (const pkg of manifest.externalDependencies) {
      if (nodeBuiltins.has(pkg)) continue;
      standaloneDeps[pkg] = rootDeps[pkg] || 'latest';
    }

    const featureSlug = manifest.featureName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const standalonePkg = {
      name: `@repo-ai/${featureSlug}`,
      version: '1.0.0',
      description: manifest.summary,
      main: manifest.entryPoints[0] || 'index.ts',
      dependencies: standaloneDeps,
    };

    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify(standalonePkg, null, 2)
    );
    console.log(`  → Synthesized standalone package.json`);

    // 4. Generate a README
    const readmeContent = `# ${manifest.featureName}\n\n> Category: \`${manifest.category}\`\n\n${manifest.summary}\n\n## Capabilities\n${manifest.capabilities.map((c) => `- ${c}`).join('\n')}\n\n## Files Extracted\n${manifest.files.map((f) => `- \`${f}\``).join('\n')}\n`;

    fs.writeFileSync(path.join(targetDir, 'README.md'), readmeContent);
    console.log(`  → Created README.md`);
    console.log(`\n✓ Feature extraction complete.`);
  }
}