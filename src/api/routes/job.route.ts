import { Router, Request, Response, NextFunction } from 'express';
import { JobController } from '../controllers/job.controller';

const router = Router();

// 1. GET /api/jobs
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  return JobController.listJobs(req, res, next);
});

// 2. GET /api/jobs/:id/events (MUST BE ABOVE /:id)
router.get('/:id/events', (req: Request, res: Response) => {
  return JobController.streamJobProgress(req, res);
});

// 3. GET /api/jobs/:id
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  return JobController.getJobStatus(req, res, next);
});

export default router;