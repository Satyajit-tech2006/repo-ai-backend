import fs from 'fs';
import path from 'path';
import { FeatureManifest } from '../semantic';

export interface TargetRepoProfile {
  dependencies: Record<string, string>;
  isTypeScript: boolean;
  framework?: 'express' | 'fastify' | 'nest' | 'next' | 'unknown';
  ormOrDriver?: 'prisma' | 'mongoose' | 'typeorm' | 'sequelize' | 'pg' | 'unknown';
}

export interface CompatibilityReport {
  suitabilityScore: number; // 0 to 100
  conflicts: string[];
  missingDependencies: string[];
  sharedDependencies: string[];
  frameworkMatch: boolean;
  notes: string[];
}

export class CompatibilityChecker {
  public static profileTarget(targetPath: string): TargetRepoProfile {
    const pkgPath = path.resolve(targetPath, 'package.json');
    const tsConfigPath = path.resolve(targetPath, 'tsconfig.json');

    let deps: Record<string, string> = {};
    if (fs.existsSync(pkgPath)) {
      const rawPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      deps = { ...rawPkg.dependencies, ...rawPkg.devDependencies };
    }

    // Detect Framework
    let framework: TargetRepoProfile['framework'] = 'unknown';
    if (deps['express']) framework = 'express';
    else if (deps['fastify']) framework = 'fastify';
    else if (deps['@nestjs/core']) framework = 'nest';
    else if (deps['next']) framework = 'next';

    // Detect Database / ORM
    let ormOrDriver: TargetRepoProfile['ormOrDriver'] = 'unknown';
    if (deps['@prisma/client'] || deps['prisma']) ormOrDriver = 'prisma';
    else if (deps['mongoose']) ormOrDriver = 'mongoose';
    else if (deps['typeorm']) ormOrDriver = 'typeorm';
    else if (deps['sequelize']) ormOrDriver = 'sequelize';
    else if (deps['pg']) ormOrDriver = 'pg';

    return {
      dependencies: deps,
      isTypeScript: fs.existsSync(tsConfigPath) || Boolean(deps['typescript']),
      framework,
      ormOrDriver,
    };
  }

  public static check(manifest: FeatureManifest, targetProfile: TargetRepoProfile): CompatibilityReport {
    const conflicts: string[] = [];
    const missingDeps: string[] = [];
    const sharedDeps: string[] = [];
    const notes: string[] = [];

    let score = 100;

    // 1. Check Framework Alignments
    const manifestDeps = new Set(manifest.externalDependencies);

    const isExpressFeature = manifestDeps.has('express');
    const isFastifyFeature = manifestDeps.has('fastify');

    let frameworkMatch = true;
    if (isExpressFeature && targetProfile.framework !== 'express' && targetProfile.framework !== 'unknown') {
      conflicts.push(`Feature requires Express, but target repository uses ${targetProfile.framework}.`);
      score -= 25;
      frameworkMatch = false;
    } else if (isFastifyFeature && targetProfile.framework !== 'fastify' && targetProfile.framework !== 'unknown') {
      conflicts.push(`Feature requires Fastify, but target repository uses ${targetProfile.framework}.`);
      score -= 25;
      frameworkMatch = false;
    }

    // 2. Check Database / ORM Alignments
    const hasMongo = manifestDeps.has('mongoose') || manifestDeps.has('mongodb');
    const hasPostgres = manifestDeps.has('pg') || manifestDeps.has('@prisma/client');

    if (hasMongo && targetProfile.ormOrDriver === 'prisma') {
      conflicts.push('Feature relies on MongoDB/Mongoose, but target repository is configured with Prisma.');
      score -= 25;
    } else if (hasPostgres && targetProfile.ormOrDriver === 'mongoose') {
      conflicts.push('Feature relies on SQL/PostgreSQL, but target repository uses Mongoose/MongoDB.');
      score -= 25;
    }

    // 3. Check Dependencies overlap vs missing
    const nodeBuiltins = new Set(['fs', 'path', 'os', 'crypto', 'http', 'https', 'stream', 'util', 'events']);

    for (const dep of manifest.externalDependencies) {
      if (nodeBuiltins.has(dep)) continue;

      if (targetProfile.dependencies[dep]) {
        sharedDeps.push(dep);
      } else {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      notes.push(`${missingDeps.length} new package(s) will need to be installed in the target repository.`);
    }

    return {
      suitabilityScore: Math.max(0, score),
      conflicts,
      missingDependencies: missingDeps,
      sharedDependencies: sharedDeps,
      frameworkMatch,
      notes,
    };
  }
}