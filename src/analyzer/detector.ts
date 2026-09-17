import { DependencyGraph } from './resolver';

export interface EntryCandidate {
  filePath: string;
  categoryHint: string;
  weight: number;
}

export class EntryPointDetector {
  private static readonly PATTERNS: Array<{ regex: RegExp; category: string; weight: number }> = [
    { regex: /[\\/]routes?[\\/].+\.[jt]sx?$/, category: 'api_route', weight: 100 },
    { regex: /[\\/]controllers?[\\/].+\.[jt]sx?$/, category: 'controller', weight: 90 },
    { regex: /[\\/]modules?[\\/][^\\/]+[\\/]index\.[jt]sx?$/, category: 'module_root', weight: 85 },
    { regex: /[\\/]features?[\\/][^\\/]+[\\/]index\.[jt]sx?$/, category: 'feature_root', weight: 85 },
    { regex: /[\\/]sockets?[\\/].+\.[jt]sx?$/, category: 'realtime_socket', weight: 80 },
    { regex: /[\\/]queues?[\\/].+\.[jt]sx?$/, category: 'background_job', weight: 80 },
    { regex: /[\\/]services?[\\/].+\.[jt]sx?$/, category: 'business_service', weight: 70 },
  ];

  public static findCandidates(graph: DependencyGraph): EntryCandidate[] {
    const filePaths = graph.nodes;
    const candidates: EntryCandidate[] = [];

    // 1. Calculate In-Degree (how many files import this file)
    const inDegree: Record<string, number> = {};
    filePaths.forEach((f) => (inDegree[f] = 0));

    for (const edge of graph.internalEdges) {
      if (inDegree[edge.to] !== undefined) {
        inDegree[edge.to]++;
      }
    }

    // 2. Score candidates
    for (const filePath of filePaths) {
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Filter out test files, declarations, or root orchestrators
      if (
        normalizedPath.includes('/tests/') ||
        normalizedPath.includes('/test/') ||
        normalizedPath.endsWith('.d.ts') ||
        normalizedPath.includes('/utils/') ||
        normalizedPath.includes('/helpers/') ||
        normalizedPath.endsWith('index.ts')
      ) {
        continue;
      }

      let matched = false;
      for (const pattern of this.PATTERNS) {
        if (pattern.regex.test(filePath)) {
          candidates.push({
            filePath,
            categoryHint: pattern.category,
            weight: pattern.weight - (inDegree[filePath] || 0) * 2,
          });
          matched = true;
          break;
        }
      }

      // 3. Fallback: Any root domain file that isn't imported by anything else
      if (!matched && inDegree[filePath] === 0) {
        candidates.push({
          filePath,
          categoryHint: 'standalone_entry',
          weight: 50,
        });
      }
    }

    return candidates.sort((a, b) => b.weight - a.weight);
  }

  public static deduplicateSlices(
    rawSlices: Array<{ entryPoint: string; internalFiles: string[]; externalDependencies: string[] }>
  ) {
    const sorted = [...rawSlices].sort((a, b) => b.internalFiles.length - a.internalFiles.length);
    const uniqueFeatures: typeof rawSlices = [];

    for (const current of sorted) {
      const currentFileSet = new Set(current.internalFiles);

      // Check if this slice is >85% contained in an existing, larger slice
      const isSubsumed = uniqueFeatures.some((existing) => {
        let sharedCount = 0;
        currentFileSet.forEach((f) => {
          if (existing.internalFiles.includes(f)) sharedCount++;
        });
        const overlapRatio = sharedCount / currentFileSet.size;
        return overlapRatio > 0.85;
      });

      if (!isSubsumed) {
        uniqueFeatures.push(current);
      }
    }

    return uniqueFeatures;
  }
}