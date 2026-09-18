import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { ApiResponse } from '../utils/api-response';
import { FeatureCatalog } from '../../semantic';
import { RepositoryIndexer } from '../../indexer';
import { CompatibilityChecker, BlueprintGenerator } from '../../compatibility';
import { FeatureExtractor } from '../../cli/extractor';

export class FeatureController {
  private static catalog = new FeatureCatalog();

  // GET /api/features
  public static async getAllFeatures(req: Request, res: Response, next: NextFunction) {
    try {
      const results = await FeatureController.catalog.search('', 100);
      const features = results.map((r) => r.manifest);
      return ApiResponse.success(res, features, 'Retrieved catalog features');
    } catch (err) {
      next(err);
    }
  }

  // POST /api/features/search
  public static async searchFeatures(req: Request, res: Response, next: NextFunction) {
    try {
      const { query, limit = 5 } = req.body;
      if (!query || typeof query !== 'string') {
        return ApiResponse.error(res, 'A string "query" is required in the request body.', 400);
      }

      const results = await FeatureController.catalog.search(query, Number(limit));
      return ApiResponse.success(res, results, 'Search results retrieved');
    } catch (err) {
      next(err);
    }
  }

  // POST /api/features/index
  public static async triggerIndex(req: Request, res: Response, next: NextFunction) {
    try {
      const { targetDirectory = '.' } = req.body;
      const resolvedTarget = path.resolve(targetDirectory);

      const indexer = new RepositoryIndexer(resolvedTarget);
      await indexer.run();

      return ApiResponse.success(res, { targetDirectory: resolvedTarget }, 'Repository indexed successfully');
    } catch (err) {
      next(err);
    }
  }

  // POST /api/features/compatibility
  public static async evaluateCompatibility(req: Request, res: Response, next: NextFunction) {
    try {
      const { query, targetRepoPath = '.' } = req.body;
      if (!query) {
        return ApiResponse.error(res, '"query" is required to match a feature.', 400);
      }

      const results = await FeatureController.catalog.search(query, 1);
      if (results.length === 0 || results[0].score < 0.4) {
        return ApiResponse.error(res, 'No relevant feature found matching query.', 404);
      }

      const matched = results[0].manifest;
      const profile = CompatibilityChecker.profileTarget(targetRepoPath);
      const report = CompatibilityChecker.check(matched, profile);

      const blueprintGen = new BlueprintGenerator();
      const blueprint = await blueprintGen.generateBlueprint(matched, profile, report);

      return ApiResponse.success(
        res,
        {
          matchedFeature: matched.featureName,
          score: results[0].score,
          profile,
          report,
          blueprint,
        },
        'Compatibility evaluated'
      );
    } catch (err) {
      next(err);
    }
  }

  // POST /api/features/extract
  public static async extractFeature(req: Request, res: Response, next: NextFunction) {
    try {
      const { query, destinationPath = './extracted-feature', sourceRoot = '.' } = req.body;
      if (!query) {
        return ApiResponse.error(res, '"query" is required to locate feature for extraction.', 400);
      }

      const results = await FeatureController.catalog.search(query, 1);
      if (results.length === 0 || results[0].score < 0.4) {
        return ApiResponse.error(res, 'No matching feature found in catalog.', 404);
      }

      const matched = results[0].manifest;
      FeatureExtractor.extract(matched, sourceRoot, destinationPath);

      return ApiResponse.success(
        res,
        {
          extractedFeature: matched.featureName,
          destinationPath: path.resolve(destinationPath),
          files: matched.files,
        },
        'Feature extracted successfully'
      );
    } catch (err) {
      next(err);
    }
  }
}