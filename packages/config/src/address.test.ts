import { describe, expect, it } from 'vitest';
import { addressConfigFor, lookupPostalCode, normalisePhone } from './address';
import { indiaMarket } from './commerce';
import { indiaAddress } from './india-address';

describe('lookupPostalCode', () => {
  it('finds the region by postal circle and the city for major districts', () => {
    expect(lookupPostalCode('560038')).toEqual({ region: 'Karnataka', city: 'Bengaluru' });
    expect(lookupPostalCode('400050')).toEqual({ region: 'Maharashtra', city: 'Mumbai' });
    expect(lookupPostalCode('781005')).toEqual({ region: 'Assam', city: 'Guwahati' });
    expect(lookupPostalCode('577201')).toEqual({ region: 'Karnataka', city: null });
  });

  it('prefers the longest prefix', () => {
    expect(lookupPostalCode('403001')?.region).toBe('Goa');
    expect(lookupPostalCode('194101')?.region).toBe('Ladakh');
    expect(lookupPostalCode('248001')).toEqual({ region: 'Uttarakhand', city: 'Dehradun' });
    expect(lookupPostalCode('160017')).toEqual({ region: 'Chandigarh', city: 'Chandigarh' });
  });

  it('returns null for invalid or unknown codes', () => {
    expect(lookupPostalCode('012345')).toBeNull();
    expect(lookupPostalCode('5600')).toBeNull();
    expect(lookupPostalCode('990001')).toBeNull();
  });

  it('only ever names regions from the market list', () => {
    const regions = new Set(indiaAddress.regions);
    for (const entry of indiaAddress.postalLookup) expect(regions).toContain(entry.region);
  });
});

describe('normalisePhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['0091 9876543210', '+919876543210'],
    ['(987) 654 3210', '+919876543210'],
  ])('normalises %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '98765432101', '98765x3210', ''])('rejects %s', (input) => {
    expect(normalisePhone(input)).toBeNull();
  });
});

describe('addressConfigFor', () => {
  it('finds the rules for the market and refuses an unknown one', () => {
    expect(addressConfigFor(indiaMarket).regionLabel).toBe('State');
    expect(() => addressConfigFor({ ...indiaMarket, country: 'ZZ' })).toThrow(
      'No address rules for market ZZ.',
    );
  });
});
