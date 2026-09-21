import { Request, Response, NextFunction } from 'express';
import { JobManager, JobRecord } from '../../queue/job.manager';
import { ApiResponse } from '../utils/api-response';

export class JobController {
  private static jobManager = JobManager.getInstance();

  // GET /api/jobs/:id
  public static getJobStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const job = JobController.jobManager.getJob(id);

      if (!job) {
        return ApiResponse.error(res, `Job with ID "${id}" was not found.`, 404);
      }

      return ApiResponse.success(res, job, `Job status: ${job.status}`);
    } catch (err) {
      next(err);
    }
  }

  // GET /api/jobs
  public static listJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const jobs = JobController.jobManager.getAllJobs();
      return ApiResponse.success(res, jobs, 'Retrieved all queued jobs');
    } catch (err) {
      next(err);
    }
  }

  // GET /api/jobs/:id/events (Server-Sent Events)
  public static streamJobProgress(req: Request, res: Response) {
    const { id } = req.params;
    const job = JobController.jobManager.getJob(id);

    if (!job) {
      res.status(404).json({ success: false, message: `Job "${id}" not found.` });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Push initial current state
    res.write(`data: ${JSON.stringify(job)}\n\n`);

    if (job.status === 'completed' || job.status === 'failed') {
      res.end();
      return;
    }

    // Subscribe to live job updates
    const onUpdate = (updatedJob: JobRecord) => {
      res.write(`data: ${JSON.stringify(updatedJob)}\n\n`);
      if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
        JobController.jobManager.off(`job:${id}`, onUpdate);
        res.end();
      }
    };

    JobController.jobManager.on(`job:${id}`, onUpdate);

    // Clean up listener if client disconnects early
    req.on('close', () => {
      JobController.jobManager.off(`job:${id}`, onUpdate);
    });
  }
}