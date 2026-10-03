import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps paths on this site', () => {
    expect(safeNext('/checkout')).toBe('/checkout');
    expect(safeNext('/order/LO-26-000001?token=abc')).toBe('/order/LO-26-000001?token=abc');
  });

  it('refuses other sites and odd values', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'account',
      '',
      null,
    ])
      expect(safeNext(value)).toBe('/account');
  });
});
