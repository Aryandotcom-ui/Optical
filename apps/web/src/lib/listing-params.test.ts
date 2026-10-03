import { describe, expect, it } from 'vitest';
import { activeFilters, parseListingParams } from './listing-params';
import { omitKeys } from './objects';

describe('parseListingParams', () => {
  it('parses multi-values from a comma list', () => {
    const { query, ignored } = parseListingParams({ shape: 'square,round', sort: 'price-asc' });
    expect(query.shape).toEqual(['round', 'square']);
    expect(query.sort).toBe('price-asc');
    expect(ignored).toEqual([]);
  });

  it('drops invalid parameters instead of failing the page', () => {
    const { query, ignored } = parseListingParams({
      shape: 'triangle',
      material: 'titanium',
      page: 'abc',
    });
    expect(query.shape).toEqual([]);
    expect(query.material).toEqual(['titanium']);
    expect(query.page).toBe(1);
    expect(ignored.sort()).toEqual(['page', 'shape']);
  });

  it('lets the page context win over the URL', () => {
    const { query } = parseListingParams({ category: 'kids' }, { category: 'sunglasses' });
    expect(query.category).toBe('sunglasses');
  });
});

describe('activeFilters', () => {
  it('lists each value as a chip, skipping fixed keys and the search text', () => {
    const { query } = parseListingParams(
      { shape: 'round,square', inStock: 'true', q: 'gold', category: 'kids' },
      { category: 'kids' },
    );
    expect(activeFilters(query, { category: 'kids' })).toEqual([
      { key: 'shape', value: 'round' },
      { key: 'shape', value: 'square' },
      { key: 'inStock', value: 'true' },
    ]);
  });
});

describe('omitKeys', () => {
  it('copies an object without the given keys', () => {
    const source = { a: 1, b: 2, c: 3 };
    expect(omitKeys(source, ['b'])).toEqual({ a: 1, c: 3 });
    expect(source).toEqual({ a: 1, b: 2, c: 3 });
  });
});
