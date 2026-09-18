import { Router } from 'express';
import { FeatureController } from '../controllers/feature.controller';

const router = Router();

// GET all features
router.get('/', FeatureController.getAllFeatures);

// Semantic Search
router.post('/search', FeatureController.searchFeatures);

// Indexing (Local or Remote Git)
router.post('/index', FeatureController.triggerIndex);

// Target Compatibility Check
router.post('/compatibility', FeatureController.evaluateCompatibility);

// Streamed Zip Extraction (must be declared before standard /extract)
router.post('/extract/zip', FeatureController.extractZip);

// Local Disk Extraction
router.post('/extract', FeatureController.extractFeature);

export default router;