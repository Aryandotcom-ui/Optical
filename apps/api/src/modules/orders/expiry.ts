import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../infra/prisma';
import { releaseCoupon, releaseHolds, transition } from './lifecycle';
import { orderInclude } from './orders.repository';
import { orderState } from './orders.mapper';

/** A bank still confirming a payment gets this long before its order's hold is released. */
export const PENDING_PAYMENT_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Releases stock held for orders that weren't paid in time, and cancels
 * those orders (giving back any coupon use). Holds for payments the bank is
 * still confirming are kept a little longer, so a slow UPI approval doesn't
 * lose the customer their frames.
 */
export async function expireHolds(
  db: Db,
  log: Pick<FastifyBaseLogger, 'info'>,
  now = new Date(),
): Promise<{ released: number; cancelled: number }> {
  const due = await db.stockReservation.findMany({
    where: { releasedAt: null, committedAt: null, expiresAt: { lte: now } },
    select: { orderId: true },
    distinct: ['orderId'],
    take: 200,
  });
  let released = 0;
  let cancelled = 0;
  for (const { orderId } of due) {
    if (!orderId) continue;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) return;
      const payment = order.payments[0];
      const bankStillConfirming =
        payment?.status === 'PENDING' &&
        now.getTime() - payment.createdAt.getTime() < PENDING_PAYMENT_GRACE_MS;
      if (bankStillConfirming) return;
      await releaseHolds(tx, { orderId, expiresAt: { lte: now } }, now);
      released += 1;
      if (
        order.paymentProvider !== 'COD' &&
        (order.status === 'PENDING_PAYMENT' || order.status === 'PAYMENT_FAILED')
      ) {
        await transition(tx, orderState(order), 'CANCELLED', {
          note: 'Payment was not completed in time, so the frames were released.',
        });
        await releaseCoupon(tx, orderId);
        cancelled += 1;
      }
    });
  }
  if (released) log.info({ released, cancelled }, 'Released expired stock holds');
  return { released, cancelled };
}
