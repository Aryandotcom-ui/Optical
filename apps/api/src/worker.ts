import { Worker } from 'bullmq';
import closeWithGrace from 'close-with-grace';
import pino from 'pino';
import { commerce } from '@optical/config/commerce';
import { EnvValidationError } from '@optical/config/env';
import { loadApiEnv, loadDotEnvFile } from './config/env';
import { SmtpEmailProvider } from './infra/email/provider';
import { createPrismaClient } from './infra/prisma';
import {
  BullJobQueue,
  createQueueConnection,
  jobNames,
  QUEUE_NAME,
  type MockWebhookJob,
} from './infra/queue';
import { createRedisProbe } from './infra/redis';
import {
  runMockWebhook,
  runOutbox,
  runPrescriptionReminders,
  runReconcile,
  runReservations,
  type JobContext,
} from './jobs/handlers';
import { RedisMockBank } from './modules/payments/mock';
import { PaymentGateway } from './modules/payments/payment-gateway';
import { createPaymentRegistry } from './modules/payments/registry';

/**
 * Background worker: sends emails from the outbox, releases expired stock
 * holds, reconciles pending payments, reminds customers of expiring
 * prescriptions and delivers mock payment webhooks.
 * Run several for redundancy; jobs are claimed so none runs twice.
 */
loadDotEnvFile();
let env;
try {
  env = loadApiEnv();
} catch (error) {
  if (error instanceof EnvValidationError) {
    process.stderr.write(`\n${error.message}\n\n`);
    process.exit(1);
  }
  throw error;
}

const log = pino({
  name: 'worker',
  level: env.LOG_LEVEL,
  ...(env.LOG_PRETTY
    ? {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});
const db = createPrismaClient(env.DATABASE_URL, { maxConnections: 4 });
const redis = createRedisProbe(env.REDIS_URL);
await redis.client.connect().catch((error: unknown) => {
  log.warn({ err: error }, 'Redis is not reachable yet; retrying in the background');
});
const connection = createQueueConnection(env.REDIS_URL);
const jobs = new BullJobQueue(createQueueConnection(env.REDIS_URL));
const email = new SmtpEmailProvider(env.SMTP_URL, env.EMAIL_FROM);
const gateway = new PaymentGateway(
  db,
  createPaymentRegistry(env, new RedisMockBank(redis.client)),
  jobs,
  {
    secret: env.APP_SECRET,
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    holdMinutes: commerce.policies.stockReservationMinutes,
    mockPendingSettleSeconds: env.MOCK_PENDING_SETTLE_SECONDS,
  },
  log,
);
const context: JobContext = {
  db,
  email,
  gateway,
  secret: env.APP_SECRET,
  siteUrl: env.NEXT_PUBLIC_SITE_URL,
  apiUrl: env.API_INTERNAL_URL,
  log,
};

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case jobNames.outbox:
        return runOutbox(context);
      case jobNames.reservations:
        return runReservations(context);
      case jobNames.reconcile:
        return runReconcile(context);
      case jobNames.prescriptionReminders:
        return runPrescriptionReminders(context);
      case jobNames.mockWebhook:
        return runMockWebhook(context, job.data as MockWebhookJob);
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  },
  { connection, concurrency: 4 },
);
worker.on('failed', (job, error) => {
  log.warn({ err: error, job: job?.name, attempts: job?.attemptsMade }, 'Job failed');
});

// Recurring jobs. Upserting is idempotent, so every worker can declare them.
const { queue } = jobs;
await queue.upsertJobScheduler('outbox', { every: 15_000 }, { name: jobNames.outbox });
await queue.upsertJobScheduler('reservations', { every: 60_000 }, { name: jobNames.reservations });
await queue.upsertJobScheduler('reconcile', { every: 120_000 }, { name: jobNames.reconcile });
await queue.upsertJobScheduler(
  'prescription-reminders',
  { every: 6 * 3_600_000 },
  { name: jobNames.prescriptionReminders },
);
log.info(
  'Worker started: emails, stock holds, payment reconciliation, prescription reminders, mock webhooks',
);

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) log.error({ err }, 'Worker shutting down after an unexpected error');
  else log.info({ signal }, 'Worker shutting down');
  await worker.close();
  await jobs.close();
  connection.disconnect();
  email.close();
  await redis.close();
  await db.$disconnect();
});
