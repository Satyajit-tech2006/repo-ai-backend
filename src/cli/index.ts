import path from 'path';
import { FeatureCatalog } from '../semantic';
import { FeatureExtractor } from './extractor';
import { CompatibilityChecker, BlueprintGenerator } from '../compatibility';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const catalog = new FeatureCatalog();

  if (command === 'search') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.log('Usage: npx tsx src/cli/index.ts search "<prompt>"');
      return;
    }

    console.log(`\nSearching catalog for: "${query}"...\n`);
    const results = await catalog.search(query, 3);

    results.forEach((res, i) => {
      console.log(`[${i + 1}] ${res.manifest.featureName} (Score: ${(res.score * 100).toFixed(1)}%)`);
      console.log(`    Category: ${res.manifest.category}`);
      console.log(`    Summary:  ${res.manifest.summary}`);
      console.log(`    Files:    ${res.manifest.files.join(', ')}\n`);
    });
  } else if (command === 'extract') {
    const query = args[1];
    const outIdx = args.indexOf('--out');
    const outDir = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : './extracted-feature';

    if (!query) {
      console.log('Usage: npx tsx src/cli/index.ts extract "<feature-name-or-query>" --out <dest_folder>');
      return;
    }

    console.log(`Locating best match for: "${query}"...`);
    const results = await catalog.search(query, 1);

    if (results.length === 0 || results[0].score < 0.4) {
      console.error('No matching feature found in catalog.');
      return;
    }

    const matched = results[0].manifest;
    console.log(`Found: "${matched.featureName}" (Match: ${(results[0].score * 100).toFixed(1)}%)`);

    FeatureExtractor.extract(matched, '.', outDir);
  } else if (command === 'check') {
    const query = args[1];
    const targetIdx = args.indexOf('--target');
    const targetPath = targetIdx !== -1 && args[targetIdx + 1] ? args[targetIdx + 1] : '.';

    if (!query) {
      console.log('Usage: npx tsx src/cli/index.ts check "<query>" --target <path-to-target-repo>');
      return;
    }

    console.log(`\n[Compatibility Engine] Evaluating feature suitability...`);
    const results = await catalog.search(query, 1);

    if (results.length === 0 || results[0].score < 0.4) {
      console.error('No matching feature found in catalog.');
      return;
    }

    const matched = results[0].manifest;
    console.log(`Matched Feature: "${matched.featureName}" (Match: ${(results[0].score * 100).toFixed(1)}%)`);
    console.log(`Target Repo: ${path.resolve(targetPath)}`);

    // 1. Profile Target and Check Compatibility
    const profile = CompatibilityChecker.profileTarget(targetPath);
    const report = CompatibilityChecker.check(matched, profile);

    console.log('\n--- Compatibility Report ---');
    console.log(`Suitability Score: ${report.suitabilityScore}/100`);
    console.log(`Framework: ${profile.framework} (Match: ${report.frameworkMatch})`);
    console.log(`Database/ORM: ${profile.ormOrDriver}`);

    if (report.conflicts.length > 0) {
      console.log('\nConflicts Detected:');
      report.conflicts.forEach((c) => console.log(`  - ✗ ${c}`));
    } else {
      console.log('\nConflicts Detected: None');
    }

    if (report.missingDependencies.length > 0) {
      console.log(`\nMissing Dependencies to Install:`);
      console.log(`  npm install ${report.missingDependencies.join(' ')}`);
    }

    // 2. Synthesize Integration Blueprint
    console.log('\n[Blueprint] Synthesizing integration guide with Gemini...');
    const blueprintGen = new BlueprintGenerator();

    try {
      const blueprint = await blueprintGen.generateBlueprint(matched, profile, report);

      console.log('\n--- Integration Blueprint ---');
      console.log('\nOrdered Steps:');
      blueprint.steps.forEach((step, idx) => console.log(`  ${idx + 1}. ${step}`));

      if (blueprint.requiredEnvVars.length > 0) {
        console.log('\nLikely Required Environment Variables:');
        blueprint.requiredEnvVars.forEach((v) => console.log(`  - ${v}`));
      }

      if (blueprint.adapterRecommendations.length > 0) {
        console.log('\nAdapter Recommendations:');
        blueprint.adapterRecommendations.forEach((r) => console.log(`  - ${r}`));
      }

      console.log('\nIntegration Snippet:');
      console.log('-------------------------------------------');
      console.log(blueprint.integrationSnippet);
      console.log('-------------------------------------------');
    } catch (err: any) {
      console.error('Failed to generate blueprint:', err.message);
    }
  } else {
    console.log(`
Repo AI CLI
Commands:
  search <query>                                Search feature catalog semantically
  extract <feature-name> --out <path>           Extract sliced feature into a standalone directory
  check <feature-name> --target <repo-path>     Evaluate compatibility & generate integration blueprint
    `);
  }
}

main().catch(console.error);