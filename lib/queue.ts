// lib/queue.ts — Task queue system with in-memory implementation
// Uses an in-memory queue with persistence to BackgroundJob table
// Can be upgraded to BullMQ + Redis when available
import { jobRepository } from './repositories/jobRepository';
import logger from './logger';

export type JobHandler = (payload: unknown) => Promise<unknown>;

interface QueuedJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  priority: number;
}

// ============================================
// In-Memory Job Queue
// ============================================

class JobQueue {
  private handlers: Map<string, JobHandler> = new Map();
  private processing = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private concurrency = 3;
  private activeJobs = 0;

  /** Register a job handler for a specific job type */
  registerHandler(type: string, handler: JobHandler) {
    this.handlers.set(type, handler);
    logger.info(`Job handler registered: ${type}`);
  }

  /** Add a job to the queue */
  async enqueue(type: string, payload: unknown, options: { priority?: number; maxAttempts?: number; createdBy?: string } = {}): Promise<string> {
    const job = await jobRepository.create({
      type,
      payload,
      priority: options.priority || 0,
      maxAttempts: options.maxAttempts || 3,
      createdBy: options.createdBy,
    });

    logger.info(`Job enqueued: ${type}`, { jobId: job.id });

    // Try to process immediately if not busy
    this.processNext().catch(() => {});

    return job.id;
  }

  /** Start the queue worker */
  start(pollIntervalMs: number = 5000) {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      this.processNext().catch((err) => {
        logger.error('Queue processing error', { error: err.message });
      });
    }, pollIntervalMs);

    // Don't block process exit
    if (this.pollInterval && typeof this.pollInterval === 'object' && 'unref' in this.pollInterval) {
      this.pollInterval.unref();
    }

    logger.info('Job queue worker started');
  }

  /** Stop the queue worker */
  async stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Wait for active jobs to finish (max 30 seconds)
    const deadline = Date.now() + 30_000;
    while (this.activeJobs > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    logger.info('Job queue worker stopped', { activeJobs: this.activeJobs });
  }

  /** Process the next pending job */
  private async processNext() {
    if (this.activeJobs >= this.concurrency) return;

    const pendingJobs = await jobRepository.findPending(1);
    if (pendingJobs.length === 0) return;

    const job = pendingJobs[0];
    const handler = this.handlers.get(job.type);

    if (!handler) {
      logger.warn(`No handler for job type: ${job.type}`, { jobId: job.id });
      await jobRepository.updateStatus(job.id, 'failed', { error: `No handler registered for type: ${job.type}` });
      return;
    }

    this.activeJobs++;
    const startTime = Date.now();

    try {
      // Mark as running
      await jobRepository.updateStatus(job.id, 'running');
      await jobRepository.incrementAttempts(job.id);

      logger.info(`Processing job: ${job.type}`, { jobId: job.id, attempt: job.attempts + 1 });

      // Execute handler
      const result = await handler(job.payload);

      // Mark as completed
      await jobRepository.updateStatus(job.id, 'completed', { result });
      logger.info(`Job completed: ${job.type}`, {
        jobId: job.id,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const shouldRetry = job.attempts + 1 < job.maxAttempts;

      if (shouldRetry) {
        // Put back in pending state for retry
        await jobRepository.updateStatus(job.id, 'pending', { error: errorMessage });
        logger.warn(`Job failed, will retry: ${job.type}`, {
          jobId: job.id,
          attempt: job.attempts + 1,
          maxAttempts: job.maxAttempts,
          error: errorMessage,
        });
      } else {
        // Max retries exhausted
        await jobRepository.updateStatus(job.id, 'failed', { error: errorMessage });
        logger.error(`Job failed permanently: ${job.type}`, {
          jobId: job.id,
          attempts: job.attempts + 1,
          error: errorMessage,
        });
      }
    } finally {
      this.activeJobs--;
      // Try to process next job
      this.processNext().catch(() => {});
    }
  }
}

// ============================================
// Global Queue Instance
// ============================================

export const jobQueue = new JobQueue();

// Register default handlers
jobQueue.registerHandler('email_send', async (payload) => {
  const { sendReportEmail } = await import('./email');
  const { to, reportTitle, reportPath, pipelineSummary } = payload as any;
  return sendReportEmail({ to, reportTitle, reportPath, pipelineSummary });
});

jobQueue.registerHandler('audit_flush', async () => {
  const { flushAuditBuffer } = await import('./audit');
  return flushAuditBuffer();
});

// Start the queue worker (server-side only)
if (typeof window === 'undefined') {
  jobQueue.start();
}
