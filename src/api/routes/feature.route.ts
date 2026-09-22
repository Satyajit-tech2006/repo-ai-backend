import { Router } from 'express';
import { FeatureController } from '../controllers/feature.controller';

const router = Router();

// Repository list
router.get('/repositories', FeatureController.listRepositories);

// Feature routes
router.get('/', FeatureController.getAllFeatures);
router.post('/search', FeatureController.searchFeatures);
router.post('/index', FeatureController.triggerIndex);
router.post('/compatibility', FeatureController.evaluateCompatibility);
router.post('/extract', FeatureController.extractFeature);
router.post('/extract/zip', FeatureController.extractZip);

export default router;