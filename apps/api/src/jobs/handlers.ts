import type { FastifyBaseLogger } from 'fastify';
import { dispatchOutbox } from '../infra/email/outbox';
import type { EmailProvider } from '../infra/email/provider';
import type { Db } from '../infra/prisma';
import type { MockWebhookJob } from '../infra/queue';
import { expireHolds } from '../modules/orders/expiry';
import { buildMockWebhook } from '../modules/payments/mock';
import type { PaymentGateway } from '../modules/payments/payment-gateway';

export interface JobContext {
  db: Db;
  email: EmailProvider;
  gateway: PaymentGateway;
  secret: string;
  /** Where the worker reaches the API, for mock webhooks. */
  apiUrl: string;
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  fetch?: typeof fetch;
}

/** Sends due emails until the outbox is drained (in batches of 20). */
export async function runOutbox(context: JobContext): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < 10; batch += 1) {
    const result = await dispatchOutbox(context.db, context.email);
    total += result.sent;
    if (result.sent + result.failed < 20) break;
  }
  return total;
}

export function runReservations(context: JobContext) {
  return expireHolds(context.db, context.log);
}

export function runReconcile(context: JobContext) {
  return context.gateway.reconcile();
}

/**
 * Posts a signed mock webhook to the API, exactly as a real provider would.
 * A non-2xx answer throws, so the queue retries with backoff.
 */
export async function runMockWebhook(context: JobContext, job: MockWebhookJob): Promise<void> {
  const { body, headers } = buildMockWebhook(context.secret, job);
  const response = await (context.fetch ?? fetch)(`${context.apiUrl}/v1/webhooks/mock`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Mock webhook was refused with ${response.status}`);
}
