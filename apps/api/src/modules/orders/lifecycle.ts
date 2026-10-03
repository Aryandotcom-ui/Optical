import { canTransition, type OrderStatus } from '@optical/shared/orders';
import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';

export type Tx = Prisma.TransactionClient;

export interface OrderState {
  id: string;
  status: OrderStatus;
  paymentProvider: 'MOCK' | 'RAZORPAY' | 'STRIPE' | 'COD';
  awaitingPrescription: boolean;
  needsProduction: boolean;
}

/**
 * Moves an order to a new status through the shared state machine, and
 * records the step on its timeline. Refuses edges the machine forbids.
 */
export async function transition(
  tx: Tx,
  order: OrderState,
  to: OrderStatus,
  options: { note?: string; visibleToCustomer?: boolean; actorId?: string } = {},
): Promise<OrderState> {
  const check = canTransition(order.status, to, {
    needsProduction: order.needsProduction,
    awaitingPrescription: order.awaitingPrescription,
    cashOnDelivery: order.paymentProvider === 'COD',
  });
  if (!check.allowed) throw new AppError('CONFLICT', check.reason);
  await tx.order.update({
    where: { id: order.id },
    data: { status: to, ...(to === 'CANCELLED' ? { cancelledAt: new Date() } : {}) },
  });
  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: to,
      note: options.note ?? null,
      actorId: options.actorId ?? null,
      visibleToCustomer: options.visibleToCustomer ?? true,
    },
  });
  return { ...order, status: to };
}

/** Sums quantities per variant, so a frame in the bag twice is held once. */
export function unitsPerVariant(lines: readonly { variantId: string; quantity: number }[]) {
  const units = new Map<string, number>();
  for (const line of lines)
    units.set(line.variantId, (units.get(line.variantId) ?? 0) + line.quantity);
  return [...units].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Holds stock for an order until `expiresAt`. The conditional update only
 * succeeds while enough units are free, so two checkouts can never hold the
 * last frame at once.
 */
export async function holdStock(
  tx: Tx,
  orderId: string,
  lines: readonly { variantId: string; quantity: number; name: string }[],
  expiresAt: Date,
): Promise<void> {
  for (const { variantId, quantity } of unitsPerVariant(lines)) {
    const held = await tx.$executeRaw`
      UPDATE "StockItem" SET reserved = reserved + ${quantity}, "updatedAt" = now()
      WHERE "variantId" = ${variantId}::uuid AND "onHand" - reserved >= ${quantity}`;
    if (held === 0) {
      const name = lines.find((line) => line.variantId === variantId)?.name ?? 'An item';
      throw new AppError(
        'OUT_OF_STOCK',
        `${name} has just sold out. Remove it from your bag to continue.`,
      );
    }
    await tx.stockReservation.create({ data: { orderId, variantId, quantity, expiresAt } });
  }
}

/** Turns an order's open holds into sales: the units leave stock. */
export async function commitHolds(tx: Tx, orderId: string, now = new Date()): Promise<void> {
  const holds = await tx.stockReservation.findMany({
    where: { orderId, releasedAt: null, committedAt: null },
  });
  for (const hold of holds) {
    await tx.$executeRaw`
      UPDATE "StockItem" SET "onHand" = "onHand" - ${hold.quantity}, reserved = reserved - ${hold.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${hold.variantId}::uuid`;
    await tx.stockReservation.update({ where: { id: hold.id }, data: { committedAt: now } });
  }
}

/** Ends holds without a sale, returning the units to stock. */
export async function releaseHolds(
  tx: Tx,
  where: Prisma.StockReservationWhereInput,
  now = new Date(),
): Promise<string[]> {
  const holds = await tx.stockReservation.findMany({
    where: { ...where, releasedAt: null, committedAt: null },
  });
  for (const hold of holds) {
    await tx.$executeRaw`
      UPDATE "StockItem" SET reserved = GREATEST(reserved - ${hold.quantity}, 0), "updatedAt" = now()
      WHERE "variantId" = ${hold.variantId}::uuid`;
    await tx.stockReservation.update({ where: { id: hold.id }, data: { releasedAt: now } });
  }
  return [...new Set(holds.map((hold) => hold.orderId).filter((id) => id !== null))];
}

/**
 * Puts sold units back in stock when an order whose stock was already
 * committed is cancelled, recording each as a stock adjustment. Runs once:
 * callers hold the order's row lock and move it out of a cancellable status.
 */
export async function restockCommitted(tx: Tx, order: { id: string; number: string }) {
  const sold = await tx.stockReservation.findMany({
    where: { orderId: order.id, committedAt: { not: null } },
  });
  for (const hold of sold) {
    await tx.$executeRaw`
      UPDATE "StockItem" SET "onHand" = "onHand" + ${hold.quantity}, "updatedAt" = now()
      WHERE "variantId" = ${hold.variantId}::uuid`;
    await tx.stockAdjustment.create({
      data: {
        variantId: hold.variantId,
        delta: hold.quantity,
        reason: `Order ${order.number} cancelled`,
      },
    });
  }
}

/** Gives a cancelled order's coupon use back, so the customer can use it again. */
export async function releaseCoupon(tx: Tx, orderId: string): Promise<void> {
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (!redemption) return;
  await tx.couponRedemption.delete({ where: { id: redemption.id } });
  await tx.coupon.update({
    where: { id: redemption.couponId },
    data: { usageCount: { decrement: 1 } },
  });
}

/** Takes one use of a coupon, unless its usage limit was reached in the meantime. */
export async function redeemCoupon(
  tx: Tx,
  coupon: { id: string; code: string },
  redemption: { orderId: string; email: string; discountMinor: number },
): Promise<void> {
  const taken = await tx.$executeRaw`
    UPDATE "Coupon" SET "usageCount" = "usageCount" + 1, "updatedAt" = now()
    WHERE id = ${coupon.id}::uuid AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")`;
  if (taken === 0)
    throw new AppError(
      'CONFLICT',
      `The code ${coupon.code} has just been fully redeemed. Remove it to continue.`,
    );
  await tx.couponRedemption.create({ data: { couponId: coupon.id, ...redemption } });
}
