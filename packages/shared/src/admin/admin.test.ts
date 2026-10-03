import { commerce } from '@optical/config/commerce';
import { describe, expect, it } from 'vitest';
import {
  applyMarketSettings,
  areasFor,
  canAccess,
  couponInputSchema,
  marketSettingsFrom,
  prescriptionReviewSchema,
} from './index';

describe('admin permissions', () => {
  it('lets admins do everything and customers nothing', () => {
    expect(areasFor('ADMIN').every((entry) => entry.write)).toBe(true);
    expect(areasFor('CUSTOMER')).toEqual([]);
    expect(canAccess('CUSTOMER', 'orders', 'read')).toBe(false);
  });

  it('gives staff the daily work, and read-only products and customers', () => {
    expect(canAccess('STAFF', 'orders', 'write')).toBe(true);
    expect(canAccess('STAFF', 'prescriptions', 'write')).toBe(true);
    expect(canAccess('STAFF', 'products', 'read')).toBe(true);
    expect(canAccess('STAFF', 'products', 'write')).toBe(false);
    expect(canAccess('STAFF', 'settings', 'read')).toBe(false);
    expect(canAccess('STAFF', 'audit', 'read')).toBe(false);
  });
});

describe('market settings', () => {
  it('round-trips the defaults and overlays saved values', () => {
    const defaults = marketSettingsFrom(commerce);
    expect(applyMarketSettings(commerce, defaults).shipping).toEqual(commerce.shipping);
    const changed = applyMarketSettings(commerce, {
      freeShippingThresholdMinor: 999_00,
      codEnabled: false,
    });
    expect(changed.shipping.freeShippingThresholdMinor).toBe(999_00);
    expect(changed.cashOnDelivery.enabled).toBe(false);
    // Tax and zones never change here.
    expect(changed.tax).toBe(commerce.tax);
    expect(changed.shipping.zones).toBe(commerce.shipping.zones);
  });
});

describe('admin inputs', () => {
  it('requires the value a coupon kind needs, and upper-cases codes', () => {
    expect(
      couponInputSchema.safeParse({ code: 'ten', description: 'x', kind: 'percentage' }).success,
    ).toBe(false);
    const fixed = couponInputSchema.parse({
      code: 'ten',
      description: 'x',
      kind: 'fixed',
      amountMinor: 100_00,
    });
    expect(fixed.code).toBe('TEN');
  });

  it('needs a template for a correction but not for an approval', () => {
    expect(prescriptionReviewSchema.safeParse({ decision: 'approve' }).success).toBe(true);
    expect(prescriptionReviewSchema.safeParse({ decision: 'correction' }).success).toBe(false);
  });
});
