import { describe, expect, it } from 'vitest';
import {
  canTransition,
  happyPath,
  nextStatuses,
  orderStatusCopy,
  orderStatuses,
  type OrderContext,
} from './state-machine';

const lensOrder: OrderContext = {
  needsProduction: true,
  awaitingPrescription: false,
  cashOnDelivery: false,
};
const frameOnly: OrderContext = {
  needsProduction: false,
  awaitingPrescription: false,
  cashOnDelivery: false,
};

describe('canTransition', () => {
  it('follows the happy path for prepaid lens orders', () => {
    const path = happyPath({
      needsProduction: true,
      cashOnDelivery: false,
      prescriptionProvidedLater: true,
    });
    expect(path).toEqual([
      'PENDING_PAYMENT',
      'PAID',
      'PRESCRIPTION_REVIEW',
      'IN_PRODUCTION',
      'QUALITY_CHECK',
      'SHIPPED',
      'DELIVERED',
    ]);
    let awaiting = true;
    for (let i = 1; i < path.length; i += 1) {
      const check = canTransition(path[i - 1]!, path[i]!, {
        ...lensOrder,
        awaitingPrescription: awaiting,
      });
      expect(check).toEqual({ allowed: true });
      if (path[i] === 'PRESCRIPTION_REVIEW') awaiting = false;
    }
  });

  it('skips production for frame-only orders', () => {
    expect(
      happyPath({
        needsProduction: false,
        cashOnDelivery: false,
        prescriptionProvidedLater: false,
      }),
    ).toEqual(['PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED']);
    expect(canTransition('PAID', 'IN_PRODUCTION', frameOnly)).toMatchObject({ allowed: false });
    expect(canTransition('PAID', 'SHIPPED', frameOnly)).toEqual({ allowed: true });
  });

  it('never ships lens orders straight after payment', () => {
    expect(canTransition('PAID', 'SHIPPED', lensOrder)).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/made and checked/) as string,
    });
  });

  it('holds production until the prescription is verified', () => {
    expect(
      canTransition('PAID', 'IN_PRODUCTION', { ...lensOrder, awaitingPrescription: true }),
    ).toMatchObject({ allowed: false });
    expect(canTransition('PAID', 'PRESCRIPTION_REVIEW', lensOrder)).toMatchObject({
      allowed: false,
    });
  });

  it('fulfils cash-on-delivery orders without a PAID step', () => {
    const cod: OrderContext = { ...frameOnly, cashOnDelivery: true };
    expect(
      happyPath({ needsProduction: false, cashOnDelivery: true, prescriptionProvidedLater: false }),
    ).toEqual(['PENDING_PAYMENT', 'SHIPPED', 'DELIVERED']);
    expect(canTransition('PENDING_PAYMENT', 'SHIPPED', cod)).toEqual({ allowed: true });
    expect(canTransition('PENDING_PAYMENT', 'PAID', cod)).toMatchObject({ allowed: false });
    expect(canTransition('PENDING_PAYMENT', 'SHIPPED', frameOnly)).toMatchObject({
      allowed: false,
    });
  });

  it('rejects edges that do not exist', () => {
    expect(canTransition('DELIVERED', 'SHIPPED', lensOrder)).toMatchObject({ allowed: false });
    expect(canTransition('REFUNDED', 'PAID', lensOrder)).toMatchObject({ allowed: false });
  });

  it('supports returns, refunds and QC remakes', () => {
    expect(nextStatuses('DELIVERED', lensOrder)).toEqual(['RETURN_REQUESTED']);
    expect(nextStatuses('RETURN_REQUESTED', lensOrder)).toEqual(['RETURNED', 'DELIVERED']);
    expect(nextStatuses('QUALITY_CHECK', lensOrder)).toEqual(['SHIPPED', 'IN_PRODUCTION']);
    expect(nextStatuses('REFUNDED', lensOrder)).toEqual([]);
  });

  it('has customer copy for every status', () => {
    for (const status of orderStatuses)
      expect(orderStatusCopy[status].label.length).toBeGreaterThan(0);
  });
});
