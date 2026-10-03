import { z } from 'zod';
import { formatMoney } from '../money/money';
import { applyBasisPoints, type MinorUnits } from '../money/money';

export const couponKinds = ['percentage', 'fixed', 'free-shipping'] as const;
export const couponKindSchema = z.enum(couponKinds);
export type CouponKind = z.infer<typeof couponKindSchema>;

/** A coupon as loaded from the database, with its usage counts. */
export interface CouponDefinition {
  code: string;
  kind: CouponKind;
  /** For percentage coupons, e.g. 1000 = 10%. */
  percentBasisPoints: number | null;
  /** For fixed coupons. */
  amountMinor: MinorUnits | null;
  /** Upper bound on the discount, or null for none. */
  maxDiscountMinor: MinorUnits | null;
  minSubtotalMinor: MinorUnits;
  firstOrderOnly: boolean;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  customerUsageCount: number;
}

export const couponRejections = [
  'inactive',
  'not-started',
  'expired',
  'usage-limit-reached',
  'customer-limit-reached',
  'first-order-only',
  'below-minimum',
] as const;
export type CouponRejection = (typeof couponRejections)[number];

export interface CouponContext {
  now: Date;
  isFirstOrder: boolean;
  subtotalMinor: MinorUnits;
}

export type CouponEvaluation =
  | { eligible: true; discountMinor: MinorUnits; freeShipping: boolean }
  | { eligible: false; reason: CouponRejection; message: string };

/**
 * Decides whether a coupon applies and how much it takes off the
 * subtotal. Messages say exactly why a code didn't work and, where there
 * is one, what would make it work.
 */
export function evaluateCoupon(coupon: CouponDefinition, context: CouponContext): CouponEvaluation {
  const reject = (reason: CouponRejection, message: string): CouponEvaluation => ({
    eligible: false,
    reason,
    message,
  });
  const code = coupon.code;

  if (!coupon.active) return reject('inactive', `The code ${code} is no longer active.`);
  if (coupon.startsAt && context.now < coupon.startsAt)
    return reject('not-started', `The code ${code} is not active yet.`);
  if (coupon.endsAt && context.now >= coupon.endsAt)
    return reject('expired', `The code ${code} has expired.`);
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return reject('usage-limit-reached', `The code ${code} has been fully redeemed.`);
  }
  if (coupon.perCustomerLimit !== null && coupon.customerUsageCount >= coupon.perCustomerLimit) {
    return reject('customer-limit-reached', `You have already used the code ${code}.`);
  }
  if (coupon.firstOrderOnly && !context.isFirstOrder) {
    return reject('first-order-only', `The code ${code} is for first orders only.`);
  }
  if (context.subtotalMinor < coupon.minSubtotalMinor) {
    const shortfall = coupon.minSubtotalMinor - context.subtotalMinor;
    return reject(
      'below-minimum',
      `The code ${code} applies to orders of ${formatMoney(coupon.minSubtotalMinor)} or more. Add ${formatMoney(shortfall)} to use it.`,
    );
  }

  let discount = 0;
  if (coupon.kind === 'percentage')
    discount = applyBasisPoints(context.subtotalMinor, coupon.percentBasisPoints ?? 0);
  if (coupon.kind === 'fixed') discount = coupon.amountMinor ?? 0;
  if (coupon.maxDiscountMinor !== null) discount = Math.min(discount, coupon.maxDiscountMinor);
  discount = Math.max(0, Math.min(discount, context.subtotalMinor));

  return { eligible: true, discountMinor: discount, freeShipping: coupon.kind === 'free-shipping' };
}
