import type { MockOutcome } from '@optical/shared/checkout';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../infra/prisma';
import type { JobQueue } from '../../infra/queue';
import { AppError } from '../../lib/app-error';
import { randomToken } from '../../lib/tokens';
import { verifyOrderAccess } from '../orders/order-access';
import { MockProvider } from './mock';
import type { PaymentEvent, PaymentProvider } from './provider';

export interface SimulationDeps {
  db: Db;
  provider: PaymentProvider | undefined;
  jobs: JobQueue;
  secret: string;
  settleSeconds: number;
  log: Pick<FastifyBaseLogger, 'error'>;
}

/**
 * The local payment simulator: records what the pretend bank decided and
 * queues the matching signed webhook(s) for the worker to deliver. Only the
 * order's owner, or the holder of its access token, can decide its payment. Returns the
 * order id.
 */
export async function simulateMockPayment(
  deps: SimulationDeps,
  paymentId: string,
  outcome: MockOutcome,
  token: string | undefined,
  userId: string | null = null,
): Promise<string> {
  const payment = await deps.db.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { userId: true } } },
  });
  const provider = deps.provider;
  const holder =
    payment !== null &&
    ((userId !== null && payment.order.userId === userId) ||
      (token !== undefined && verifyOrderAccess(deps.secret, payment.orderId, token)));
  const authorised =
    payment?.provider === 'MOCK' &&
    payment.providerRef !== null &&
    provider instanceof MockProvider &&
    holder;
  if (!authorised || !payment.providerRef)
    throw AppError.notFound('We could not find that payment.');
  if (payment.status === 'SUCCEEDED' || payment.status === 'FAILED')
    throw new AppError('CONFLICT', 'This payment is already complete.');

  const ref = payment.providerRef;
  const settleMs = deps.settleSeconds * 1000;
  const failureReason = outcome === 'failure' ? 'The bank declined the payment (simulated).' : null;
  await provider.bank.set(ref, {
    outcome: outcome === 'success' ? 'succeeded' : outcome === 'failure' ? 'failed' : 'pending',
    failureReason,
    settlesAt: outcome === 'pending' ? Date.now() + settleMs : null,
  });
  const event = (eventOutcome: PaymentEvent['outcome']) => ({
    eventId: `evt_mock_${randomToken(12)}`,
    paymentRef: ref,
    outcome: eventOutcome,
    ...(failureReason ? { failureReason } : {}),
  });
  try {
    if (outcome === 'pending') {
      await deps.jobs.deliverMockWebhook(event('pending'), 300);
      await deps.jobs.deliverMockWebhook(event('succeeded'), settleMs);
    } else {
      await deps.jobs.deliverMockWebhook(
        event(outcome === 'success' ? 'succeeded' : 'failed'),
        600,
      );
    }
  } catch (error) {
    deps.log.error({ err: error }, 'Could not queue the mock payment webhook');
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'Payments are unavailable right now. Try again in a moment.',
    );
  }
  return payment.orderId;
}
