import { indiaMarket } from '@optical/config/commerce';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyBasisPoints } from '../money/money';
import { allocateProportionally } from './allocate';
import { evaluateCoupon, type CouponDefinition } from './coupon';
import { addBusinessDays, estimateDelivery } from './delivery';
import { priceOrder, type PricingInput, type PricingItem } from './engine';

const now = new Date('2026-10-01T06:00:00Z'); // Thursday, 11:30 in India

function coupon(overrides: Partial<CouponDefinition> = {}): CouponDefinition {
  return {
    code: 'WELCOME10',
    kind: 'percentage',
    percentBasisPoints: 1000,
    amountMinor: null,
    maxDiscountMinor: 500_00,
    minSubtotalMinor: 0,
    firstOrderOnly: false,
    active: true,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    perCustomerLimit: null,
    customerUsageCount: 0,
    ...overrides,
  };
}

const frame: PricingItem = {
  key: 'a',
  name: 'Harbour Round',
  kind: 'frame',
  unitPriceMinor: 2_499_00,
  quantity: 1,
  lensLines: [
    { kind: 'base', code: 'single-vision', label: 'Single vision', priceMinor: 1_190_00 },
    { kind: 'package', code: 'complete', label: 'Complete', priceMinor: 990_00 },
  ],
};
const kit: PricingItem = {
  key: 'b',
  name: 'Cleaning kit',
  kind: 'accessory',
  unitPriceMinor: 299_00,
  quantity: 2,
};

function price(overrides: Partial<PricingInput> = {}) {
  return priceOrder({
    items: [frame, kit],
    now,
    isFirstOrder: true,
    shipping: { speed: 'standard', postalCode: '302001' },
    paymentMethod: 'prepaid',
    ...overrides,
  });
}

describe('allocateProportionally', () => {
  it('splits exactly, largest remainder first, ties to the earlier weight', () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(10, [700, 300])).toEqual([7, 3]);
    expect(allocateProportionally(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProportionally(5, [])).toEqual([]);
  });

  it('rejects impossible inputs', () => {
    expect(() => allocateProportionally(-1, [1])).toThrow(RangeError);
    expect(() => allocateProportionally(1, [0, 0])).toThrow(RangeError);
    expect(() => allocateProportionally(1, [-1, 2])).toThrow(RangeError);
  });

  it('always sums to the total and stays proportional within one unit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_00 }),
        fc
          .array(fc.integer({ min: 0, max: 10_000_000_00 }), { minLength: 1, maxLength: 12 })
          .filter((w) => w.some((x) => x > 0)),
        (total, weights) => {
          const parts = allocateProportionally(total, weights);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          const sum = weights.reduce((a, b) => a + b, 0);
          parts.forEach((part, i) => {
            expect(Math.abs(part - (total * weights[i]!) / sum)).toBeLessThan(1 + 1e-6);
          });
        },
      ),
    );
  });
});

describe('evaluateCoupon', () => {
  const ctx = { now, isFirstOrder: true, subtotalMinor: 3_000_00 };

  it('applies percentage coupons with a cap', () => {
    expect(evaluateCoupon(coupon(), ctx)).toEqual({
      eligible: true,
      discountMinor: 300_00,
      freeShipping: false,
    });
    expect(evaluateCoupon(coupon(), { ...ctx, subtotalMinor: 9_000_00 })).toMatchObject({
      discountMinor: 500_00,
    });
  });

  it('never discounts more than the subtotal', () => {
    const big = coupon({
      kind: 'fixed',
      percentBasisPoints: null,
      amountMinor: 5_000_00,
      maxDiscountMinor: null,
    });
    expect(evaluateCoupon(big, { ...ctx, subtotalMinor: 1_000_00 })).toMatchObject({
      discountMinor: 1_000_00,
    });
  });

  it('marks free-shipping coupons without discounting items', () => {
    expect(
      evaluateCoupon(
        coupon({ code: 'FREESHIP', kind: 'free-shipping', percentBasisPoints: null }),
        ctx,
      ),
    ).toEqual({
      eligible: true,
      discountMinor: 0,
      freeShipping: true,
    });
  });

  it.each([
    [{ active: false }, 'inactive'],
    [{ startsAt: new Date('2026-12-01') }, 'not-started'],
    [{ endsAt: now }, 'expired'],
    [{ usageLimit: 100, usageCount: 100 }, 'usage-limit-reached'],
    [{ perCustomerLimit: 1, customerUsageCount: 1 }, 'customer-limit-reached'],
  ] as const)('rejects %o as %s', (overrides, reason) => {
    expect(evaluateCoupon(coupon(overrides), ctx)).toMatchObject({ eligible: false, reason });
  });

  it('explains first-order and minimum-spend rules', () => {
    expect(
      evaluateCoupon(coupon({ firstOrderOnly: true }), { ...ctx, isFirstOrder: false }),
    ).toMatchObject({
      reason: 'first-order-only',
    });
    const result = evaluateCoupon(coupon({ minSubtotalMinor: 3_500_00 }), ctx);
    expect(result).toMatchObject({ eligible: false, reason: 'below-minimum' });
    if (!result.eligible)
      expect(result.message).toBe(
        'The code WELCOME10 applies to orders of ₹3,500 or more. Add ₹500 to use it.',
      );
  });
});

describe('priceOrder', () => {
  it('itemises frames, lens components and accessories', () => {
    const result = price();
    expect(result.lines.map((line) => [line.kind, line.amountMinor])).toEqual([
      ['frame', 2_499_00],
      ['lens-base', 1_190_00],
      ['lens-package', 990_00],
      ['accessory', 598_00],
    ]);
    expect(result.subtotalMinor).toBe(5_277_00);
    expect(result.shipping).toMatchObject({
      feeMinor: 0,
      freeStandard: true,
      remainingForFreeMinor: 0,
      zoneCode: 'rest-of-india',
    });
    expect(result.totalMinor).toBe(5_277_00);
    expect(result.issues).toEqual([]);
  });

  it('extracts 12% GST from inclusive prices', () => {
    const result = price({
      items: [{ ...kit, quantity: 1, unitPriceMinor: 1_120_00 }],
      shipping: { speed: 'standard' },
    });
    // ₹1,120 item + ₹99 shipping (below the free threshold)
    expect(result.lines[0]?.taxMinor).toBe(120_00);
    expect(result.shipping.taxMinor).toBe(1061);
    expect(result.tax.totalMinor).toBe(120_00 + 1061);
    expect(result.tax.netMinor).toBe(result.totalMinor - result.tax.totalMinor);
  });

  it('applies a coupon and spreads it across lines', () => {
    const result = price({ coupon: coupon() });
    expect(result.discountMinor).toBe(500_00);
    expect(result.lines.reduce((sum, line) => sum + line.discountMinor, 0)).toBe(500_00);
    expect(result.coupon).toMatchObject({ applied: true, discountMinor: 500_00 });
    expect(result.totalMinor).toBe(4_777_00);
  });

  it('reports a rejected coupon without changing the total', () => {
    const result = price({ coupon: coupon({ firstOrderOnly: true }), isFirstOrder: false });
    expect(result.coupon).toMatchObject({ applied: false, reason: 'first-order-only' });
    expect(result.discountMinor).toBe(0);
  });

  it('charges standard shipping below the threshold and says how much is left', () => {
    const result = price({ items: [kit] });
    expect(result.shipping).toMatchObject({
      feeMinor: 99_00,
      freeStandard: false,
      remainingForFreeMinor: 1_499_00 - 598_00,
    });
  });

  it('checks the free-shipping threshold after the discount', () => {
    const item: PricingItem = { ...kit, quantity: 1, unitPriceMinor: 1_600_00 };
    expect(price({ items: [item] }).shipping.freeStandard).toBe(true);
    expect(price({ items: [item], coupon: coupon() }).shipping.freeStandard).toBe(false);
  });

  it('charges only the upgrade for express when standard is free', () => {
    expect(price({ shipping: { speed: 'express' } }).shipping.feeMinor).toBe(249_00 - 99_00);
    expect(price({ items: [kit], shipping: { speed: 'express' } }).shipping.feeMinor).toBe(249_00);
  });

  it('waives standard shipping with a free-shipping coupon', () => {
    const result = price({
      items: [kit],
      coupon: coupon({ code: 'FREESHIP', kind: 'free-shipping', percentBasisPoints: null }),
    });
    expect(result.shipping.feeMinor).toBe(0);
    expect(result.coupon).toMatchObject({ applied: true, freeShipping: true });
  });

  it('adds remote-area surcharges even when shipping is free', () => {
    expect(price({ shipping: { speed: 'standard', postalCode: '744101' } }).shipping).toMatchObject(
      { feeMinor: 50_00, zoneCode: 'remote' },
    );
  });

  it('adds the COD fee and enforces the COD limit', () => {
    const cod = price({ paymentMethod: 'cod' });
    expect(cod.codFee.feeMinor).toBe(49_00);
    expect(cod.totalMinor).toBe(5_277_00 + 49_00);

    const expensive: PricingItem = { ...frame, unitPriceMinor: 14_000_00 };
    const blocked = price({ items: [expensive], paymentMethod: 'cod' });
    expect(blocked.cashOnDelivery).toMatchObject({ available: false });
    expect(blocked.codFee.feeMinor).toBe(0);
    expect(blocked.issues).toEqual([expect.objectContaining({ code: 'cod-unavailable' })]);
  });

  it('reports COD as unavailable when the market disables it', () => {
    const market = {
      ...indiaMarket,
      cashOnDelivery: { ...indiaMarket.cashOnDelivery, enabled: false },
    };
    expect(price({ market }).cashOnDelivery).toEqual({
      available: false,
      reason: 'Cash on delivery is not offered.',
    });
  });

  it('flags invalid quantities and prices the rest', () => {
    const result = price({ items: [frame, { ...kit, quantity: 11 }] });
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'invalid-quantity', itemKey: 'b' }),
    ]);
    expect(result.lines.every((line) => line.itemKey === 'a')).toBe(true);
  });

  it('prices an empty cart at zero with no shipping', () => {
    const result = price({ items: [] });
    expect(result).toMatchObject({
      subtotalMinor: 0,
      totalMinor: 0,
      shipping: { feeMinor: 0, remainingForFreeMinor: 0 },
    });
    expect(result.cashOnDelivery.available).toBe(false);
  });

  const itemArb: fc.Arbitrary<PricingItem> = fc.record({
    key: fc.uuid(),
    name: fc.constant('Item'),
    kind: fc.constantFrom('frame' as const, 'accessory' as const),
    unitPriceMinor: fc.integer({ min: 0, max: 50_000_00 }),
    quantity: fc.integer({ min: 1, max: 10 }),
    lensLines: fc.array(
      fc.record({
        kind: fc.constantFrom(
          'base' as const,
          'index' as const,
          'package' as const,
          'coating' as const,
          'tint' as const,
        ),
        code: fc.constant('x'),
        label: fc.constant('Lens'),
        priceMinor: fc.integer({ min: 0, max: 10_000_00 }),
      }),
      { maxLength: 5 },
    ),
  });
  const couponArb = fc.option(
    fc.record({
      kind: fc.constantFrom('percentage' as const, 'fixed' as const, 'free-shipping' as const),
      percentBasisPoints: fc.integer({ min: 0, max: 10_000 }),
      amountMinor: fc.integer({ min: 0, max: 100_000_00 }),
      maxDiscountMinor: fc.option(fc.integer({ min: 0, max: 10_000_00 })),
      minSubtotalMinor: fc.integer({ min: 0, max: 5_000_00 }),
    }),
  );

  it('keeps its invariants for any order', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { maxLength: 6 }),
        couponArb,
        fc.constantFrom('standard' as const, 'express' as const),
        fc.constantFrom('prepaid' as const, 'cod' as const),
        fc.constantFrom('560001', '302001', '744101', null),
        (items, couponInput, speed, paymentMethod, postalCode) => {
          const result = priceOrder({
            items,
            coupon: couponInput ? coupon(couponInput) : null,
            now,
            isFirstOrder: true,
            shipping: { speed, postalCode },
            paymentMethod,
          });
          const sumOf = (pick: (line: (typeof result.lines)[number]) => number) =>
            result.lines.reduce((sum, line) => sum + pick(line), 0);

          // Total is exactly the sum of its parts.
          expect(result.totalMinor).toBe(
            result.subtotalMinor -
              result.discountMinor +
              result.shipping.feeMinor +
              result.codFee.feeMinor,
          );
          expect(sumOf((line) => line.amountMinor)).toBe(result.subtotalMinor);
          expect(sumOf((line) => line.discountMinor)).toBe(result.discountMinor);
          expect(result.tax.totalMinor).toBe(
            sumOf((line) => line.taxMinor) + result.shipping.taxMinor + result.codFee.taxMinor,
          );
          // Nothing is ever negative, and discounts never exceed what they apply to.
          for (const line of result.lines) {
            expect(line.discountMinor).toBeGreaterThanOrEqual(0);
            expect(line.discountMinor).toBeLessThanOrEqual(line.amountMinor);
            expect(line.taxMinor).toBeGreaterThanOrEqual(0);
          }
          expect(result.totalMinor).toBeGreaterThanOrEqual(0);
          expect(result.tax.totalMinor).toBeLessThanOrEqual(result.totalMinor);
          expect(result.discountMinor).toBeLessThanOrEqual(result.subtotalMinor);
          // Coupon caps hold.
          if (couponInput?.maxDiscountMinor != null)
            expect(result.discountMinor).toBeLessThanOrEqual(couponInput.maxDiscountMinor);
          if (couponInput?.kind === 'percentage') {
            expect(result.discountMinor).toBeLessThanOrEqual(
              applyBasisPoints(result.subtotalMinor, couponInput.percentBasisPoints),
            );
          }
          // COD fee only when COD is actually available.
          if (!result.cashOnDelivery.available) expect(result.codFee.feeMinor).toBe(0);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('gives the same totals whatever order the items are in', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 5 }),
        couponArb,
        (items, couponInput) => {
          const run = (list: PricingItem[]) =>
            priceOrder({
              items: list,
              coupon: couponInput ? coupon(couponInput) : null,
              now,
              isFirstOrder: true,
              shipping: { speed: 'standard' },
              paymentMethod: 'prepaid',
            });
          const forward = run(items);
          const reversed = run([...items].reverse());
          expect(reversed.totalMinor).toBe(forward.totalMinor);
          expect(reversed.discountMinor).toBe(forward.discountMinor);
        },
      ),
    );
  });
});

describe('delivery estimates', () => {
  it('skips Sundays when adding business days', () => {
    // 2026-10-03 is a Saturday.
    expect(addBusinessDays('2026-10-03', 1, [0])).toBe('2026-10-05');
    expect(addBusinessDays('2026-10-01', 0, [0])).toBe('2026-10-01');
  });

  it('takes longer for prescription lenses than for frames alone', () => {
    const frameOnly = estimateDelivery({
      orderedAt: now,
      speed: 'standard',
      postalCode: '302001',
      needsLensProduction: false,
    });
    const withLenses = estimateDelivery({
      orderedAt: now,
      speed: 'standard',
      postalCode: '302001',
      needsLensProduction: true,
    });
    expect(frameOnly).toMatchObject({
      dispatchDays: 2,
      transitDays: 4,
      earliest: '2026-10-08',
      latest: '2026-10-10',
    });
    expect(withLenses.earliest > frameOnly.earliest).toBe(true);
  });

  it('is faster to metros and by express, slower to remote areas', () => {
    const base = { orderedAt: now, needsLensProduction: false } as const;
    const metroExpress = estimateDelivery({ ...base, speed: 'express', postalCode: '560001' });
    const remote = estimateDelivery({ ...base, speed: 'standard', postalCode: '744101' });
    expect(metroExpress.transitDays).toBe(1);
    expect(remote.transitDays).toBe(7);
    expect(metroExpress.earliest < remote.earliest).toBe(true);
  });

  it('uses the market time zone for the order date', () => {
    // 20:00 UTC on Thursday is already Friday in India.
    const late = estimateDelivery({
      orderedAt: new Date('2026-10-01T20:00:00Z'),
      speed: 'standard',
      needsLensProduction: false,
    });
    const early = estimateDelivery({
      orderedAt: new Date('2026-10-01T10:00:00Z'),
      speed: 'standard',
      needsLensProduction: false,
    });
    expect(late.earliest > early.earliest).toBe(true);
  });
});
