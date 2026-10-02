import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUE_NAME = 'optical-jobs';

export const jobNames = {
  /** Send due emails from the outbox. */
  outbox: 'outbox:dispatch',
  /** Release stock holds whose payment window has passed. */
  reservations: 'reservations:expire',
  /** Ask providers about payments that are still pending. */
  reconcile: 'payments:reconcile',
  /** Deliver a simulated payment webhook (mock provider only). */
  mockWebhook: 'payments:mock-webhook',
} as const;

export interface MockWebhookJob {
  eventId: string;
  paymentRef: string;
  outcome: 'succeeded' | 'failed' | 'pending';
  failureReason?: string;
}

/** What the API asks the background worker to do. */
export interface JobQueue {
  deliverMockWebhook(job: MockWebhookJob, delayMs: number): Promise<void>;
  /** Sends queued emails soon, instead of waiting for the next scheduled run. */
  kickOutbox(): Promise<void>;
  close(): Promise<void>;
}

/** BullMQ needs its own connection that retries forever instead of failing commands. */
export function createQueueConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
}

export class BullJobQueue implements JobQueue {
  readonly queue: Queue;

  constructor(private readonly connection: Redis) {
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async deliverMockWebhook(job: MockWebhookJob, delayMs: number): Promise<void> {
    await this.queue.add(jobNames.mockWebhook, job, {
      delay: delayMs,
      jobId: job.eventId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 1_000,
      removeOnFail: 1_000,
    });
  }

  async kickOutbox(): Promise<void> {
    await this.queue.add(jobNames.outbox, {}, { removeOnComplete: true, removeOnFail: 100 });
  }

  async close(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}

/** Records jobs instead of running them; tests run the handlers directly. */
export class RecordingJobQueue implements JobQueue {
  readonly mockWebhooks: { job: MockWebhookJob; delayMs: number }[] = [];
  outboxKicks = 0;

  deliverMockWebhook(job: MockWebhookJob, delayMs: number): Promise<void> {
    this.mockWebhooks.push({ job, delayMs });
    return Promise.resolve();
  }

  kickOutbox(): Promise<void> {
    this.outboxKicks += 1;
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
