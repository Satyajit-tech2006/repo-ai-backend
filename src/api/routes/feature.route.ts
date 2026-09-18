import { Router } from 'express';
import { FeatureController } from '../controllers/feature.controller';

const router = Router();

router.get('/', FeatureController.getAllFeatures);
router.post('/search', FeatureController.searchFeatures);
router.post('/index', FeatureController.triggerIndex);
router.post('/compatibility', FeatureController.evaluateCompatibility);
router.post('/extract', FeatureController.extractFeature);

export default router;