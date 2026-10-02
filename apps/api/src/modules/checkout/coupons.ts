import type { CouponDefinition } from '@optical/shared/pricing';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';

type Tx = Db | Prisma.TransactionClient;

/** A coupon with its usage, ready for the pricing engine; null if the code doesn't exist. */
export async function loadCoupon(
  db: Tx,
  code: string,
  email: string | null,
): Promise<(CouponDefinition & { id: string }) | null> {
  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) return null;
  const customerUsageCount = email
    ? await db.couponRedemption.count({ where: { couponId: coupon.id, email } })
    : 0;
  return { ...coupon, kind: coupon.kind as CouponDefinition['kind'], customerUsageCount };
}

/**
 * True when this email has no earlier order that went ahead. Failed and
 * cancelled attempts don't count, and neither do unpaid online orders.
 */
export async function isFirstOrder(db: Tx, email: string | null): Promise<boolean> {
  if (!email) return true;
  const previous = await db.order.count({
    where: {
      email,
      status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] },
      OR: [{ paymentProvider: 'COD' }, { status: { not: 'PENDING_PAYMENT' } }],
    },
  });
  return previous === 0;
}
