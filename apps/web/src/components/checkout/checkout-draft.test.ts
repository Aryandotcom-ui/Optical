import { beforeEach, describe, expect, it } from 'vitest';
import {
  attemptKey,
  clearDraft,
  contactErrors,
  deliveryErrors,
  emptyCheckoutDraft,
  fieldFromPath,
  loadDraft,
  saveDraft,
  toPlaceOrder,
  withPostalLookup,
} from './checkout-draft';

const t = (key: string, values?: Record<string, string>) =>
  `${key}${values ? JSON.stringify(values) : ''}`;

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('PIN code lookup', () => {
  it('fills city and state from a complete PIN code', () => {
    expect(withPostalLookup(emptyCheckoutDraft, '560038')).toMatchObject({
      postalCode: '560038',
      city: 'Bengaluru',
      region: 'Karnataka',
      autofilled: true,
    });
  });

  it('never overwrites what the customer typed', () => {
    const typed = { ...emptyCheckoutDraft, city: 'Whitefield', region: 'Karnataka' };
    expect(withPostalLookup(typed, '560066')).toMatchObject({
      city: 'Whitefield',
      autofilled: false,
    });
  });

  it('updates its own guess when the PIN code changes', () => {
    const first = withPostalLookup(emptyCheckoutDraft, '560038');
    expect(withPostalLookup(first, '577201')).toMatchObject({ region: 'Karnataka', city: '' });
    expect(withPostalLookup(first, '56003')).toMatchObject({
      city: 'Bengaluru',
      postalCode: '56003',
    });
  });
});

describe('validation', () => {
  it('checks contact details like the server does', () => {
    expect(
      contactErrors({ ...emptyCheckoutDraft, email: 'a@b.co', phone: '+91 98765 43210' }, t),
    ).toEqual({});
    expect(
      Object.keys(contactErrors({ ...emptyCheckoutDraft, email: 'a@b', phone: '123' }, t)),
    ).toEqual(['email', 'phone']);
  });

  it('checks the address', () => {
    const errors = deliveryErrors(
      { ...emptyCheckoutDraft, region: 'Atlantis', postalCode: '012345' },
      t,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'city',
      'fullName',
      'line1',
      'postalCode',
      'region',
    ]);
    expect(errors.postalCode).toBe('postalCode{"label":"PIN code","example":"560001"}');
  });

  it('maps server field paths to form fields', () => {
    expect(fieldFromPath('body.address.postalCode')).toBe('postalCode');
    expect(fieldFromPath('body.contact.email')).toBe('email');
    expect(fieldFromPath('body.expectedTotalMinor')).toBeNull();
  });
});

describe('never losing data', () => {
  it('keeps the draft in this tab until the order is placed', () => {
    saveDraft({ ...emptyCheckoutDraft, email: 'kept@example.com' });
    expect(loadDraft().email).toBe('kept@example.com');
    clearDraft();
    expect(loadDraft()).toEqual(emptyCheckoutDraft);
  });

  it('reuses the idempotency key for the same order and changes it for a different one', () => {
    const order = toPlaceOrder(
      { ...emptyCheckoutDraft, email: 'a@b.co', provider: 'mock' },
      2_490_00,
    );
    const key = attemptKey(order);
    expect(attemptKey(order)).toBe(key);
    expect(attemptKey({ ...order, shippingSpeed: 'express' })).not.toBe(key);
  });

  it('turns blank optional lines into null', () => {
    const order = toPlaceOrder({ ...emptyCheckoutDraft, line2: '  ', provider: 'cod' }, 100);
    expect(order.address.line2).toBeNull();
    expect(order.paymentProvider).toBe('cod');
  });
});
