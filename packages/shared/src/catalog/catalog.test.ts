import { describe, expect, it } from 'vitest';
import { frameSizeForWidth, stockStateFor } from './enums';
import { DEFAULT_PAGE_SIZE } from './constants';
import { listingQuerySchema } from './query';
import { countActiveFilters, toListingQueryString, toListingSearchParams } from './url';

describe('listingQuerySchema', () => {
  it('applies defaults to an empty query', () => {
    expect(listingQuerySchema.parse({})).toEqual({
      shape: [],
      material: [],
      size: [],
      colour: [],
      fit: [],
      feature: [],
      faceShape: [],
      collection: [],
      sort: 'recommended',
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('accepts repeated, comma-separated and duplicate multi-values', () => {
    const query = listingQuerySchema.parse({ shape: ['round,square', 'round'], colour: 'black' });
    expect(query.shape).toEqual(['round', 'square']);
    expect(query.colour).toEqual(['black']);
  });

  it('coerces numbers and flags from query strings', () => {
    const query = listingQuerySchema.parse({
      minPrice: '100000',
      maxPrice: '300000',
      inStock: 'true',
      page: '3',
      minRating: '4',
    });
    expect(query).toMatchObject({
      minPrice: 100000,
      maxPrice: 300000,
      inStock: true,
      page: 3,
      minRating: 4,
    });
  });

  it('rejects unknown filter values, inverted price ranges and oversized pages', () => {
    expect(listingQuerySchema.safeParse({ shape: 'triangle' }).success).toBe(false);
    expect(listingQuerySchema.safeParse({ minPrice: '500', maxPrice: '100' }).success).toBe(false);
    expect(listingQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(listingQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('trims and caps free-text search', () => {
    expect(listingQuerySchema.parse({ q: '  aviator  ' }).q).toBe('aviator');
    expect(listingQuerySchema.safeParse({ q: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('toListingSearchParams', () => {
  it('produces the same canonical URL for equivalent queries', () => {
    const a = toListingSearchParams(
      listingQuerySchema.parse({ shape: 'square,round', sort: 'newest', page: '2' }),
    );
    const b = toListingSearchParams(
      listingQuerySchema.parse({ page: '2', shape: ['round', 'square'], sort: 'newest' }),
    );
    expect(a.toString()).toBe(b.toString());
    expect(a.toString()).toBe('shape=round%2Csquare&sort=newest&page=2');
  });

  it('omits defaults and empty values', () => {
    expect(toListingSearchParams(listingQuerySchema.parse({})).toString()).toBe('');
  });

  it('round-trips through the schema', () => {
    const query = listingQuerySchema.parse({
      category: 'sunglasses',
      colour: 'gold,black',
      minPrice: '1000',
      inStock: '1',
    });
    const params = Object.fromEntries(toListingSearchParams(query));
    expect(listingQuerySchema.parse(params)).toEqual(query);
  });
});

describe('countActiveFilters', () => {
  it('counts each selected value and each scalar filter', () => {
    const query = listingQuerySchema.parse({
      shape: 'round,square',
      inStock: 'true',
      minPrice: '100',
      sort: 'rating',
    });
    expect(countActiveFilters(query)).toBe(4);
  });
});

describe('frameSizeForWidth', () => {
  it.each([
    [124, 'small'],
    [131.9, 'small'],
    [132, 'medium'],
    [139, 'medium'],
    [140, 'large'],
  ] as const)('%s mm is %s', (width, size) => {
    expect(frameSizeForWidth(width)).toBe(size);
  });
});

describe('stockStateFor', () => {
  it('only reports low stock at three or fewer', () => {
    expect(stockStateFor(0)).toBe('out-of-stock');
    expect(stockStateFor(3)).toBe('low-stock');
    expect(stockStateFor(4)).toBe('in-stock');
  });
});

describe('toListingQueryString', () => {
  it('keeps commas between multi-values readable', () => {
    const query = listingQuerySchema.parse({ shape: 'square,round', material: 'titanium' });
    expect(toListingQueryString(query)).toBe('shape=round,square&material=titanium');
  });

  it('still encodes other reserved characters', () => {
    expect(toListingQueryString({ q: 'a&b' })).toBe('q=a%26b');
  });
});
