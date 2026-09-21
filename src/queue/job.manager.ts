import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface JobRecord<TData = any, TResult = any> {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  data: TData;
  result?: TResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class JobManager extends EventEmitter {
  private static instance: JobManager;
  private jobs: Map<string, JobRecord> = new Map();

  private constructor() {
    super();
  }

  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      JobManager.instance = new JobManager();
    }
    return JobManager.instance;
  }

  public createJob<TData, TResult>(
    type: string,
    data: TData,
    handler: (job: JobRecord<TData, TResult>, updateProgress: (pct: number) => void) => Promise<TResult>
  ): JobRecord<TData, TResult> {
    const id = uuidv4();
    const job: JobRecord<TData, TResult> = {
      id,
      type,
      status: 'pending',
      progress: 0,
      data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.jobs.set(id, job);

    setImmediate(async () => {
      job.status = 'active';
      job.updatedAt = new Date();
      this.emit(`job:${id}`, { ...job });

      const updateProgress = (pct: number) => {
        job.progress = Math.min(100, Math.max(0, pct));
        job.updatedAt = new Date();
        this.emit(`job:${id}`, { ...job });
      };

      try {
        const result = await handler(job, updateProgress);
        job.status = 'completed';
        job.progress = 100;
        job.result = result;
      } catch (err: any) {
        job.status = 'failed';
        job.error = err?.message || 'Unknown background processing error';
      } finally {
        job.updatedAt = new Date();
        this.emit(`job:${id}`, { ...job });
      }
    });

    return job;
  }

  public getJob(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  public getAllJobs(): JobRecord[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }
}