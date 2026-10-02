import { listingQuerySchema, type ListingQueryInput } from '@optical/shared/catalog';
import { describe, expect, it } from 'vitest';
import {
  relatedEntries,
  runListing,
  type CatalogIndex,
  type CatalogIndexEntry,
} from '../src/modules/catalog/listing';

function entry(
  overrides: Partial<CatalogIndexEntry> & Pick<CatalogIndexEntry, 'id' | 'name'>,
): CatalogIndexEntry {
  return {
    slug: overrides.name.toLowerCase(),
    category: 'eyeglasses',
    shape: 'round',
    material: 'acetate',
    size: 'medium',
    fit: 'unisex',
    features: [],
    faceShapes: [],
    colourFamilies: ['black'],
    collections: [],
    priceMinor: 2_000_00,
    ratingAverage: 4,
    ratingCount: 10,
    popularity: 50,
    launchedAt: 0,
    inStock: true,
    styleTags: [],
    ...overrides,
  };
}

const index: CatalogIndex = {
  collectionNames: { classics: 'Everyday classics' },
  entries: [
    entry({
      id: 'a',
      name: 'Alpha',
      shape: 'round',
      priceMinor: 1_500_00,
      popularity: 90,
      collections: ['classics'],
      features: ['lightweight'],
      faceShapes: ['square', 'oval'],
    }),
    entry({
      id: 'b',
      name: 'Bravo',
      shape: 'square',
      priceMinor: 2_500_00,
      popularity: 80,
      colourFamilies: ['gold', 'silver'],
      ratingAverage: 4.8,
      launchedAt: 3,
    }),
    entry({
      id: 'c',
      name: 'Charlie',
      shape: 'round',
      material: 'metal',
      priceMinor: 3_000_00,
      popularity: 70,
      inStock: false,
      launchedAt: 2,
    }),
    entry({
      id: 'd',
      name: 'Delta',
      category: 'sunglasses',
      shape: 'aviator',
      priceMinor: 4_000_00,
      popularity: 95,
      ratingAverage: null,
      ratingCount: 0,
      launchedAt: 1,
    }),
  ],
};

const run = (input: ListingQueryInput, ranks?: Map<string, number>) =>
  runListing(index, listingQuerySchema.parse(input), ranks);

describe('runListing', () => {
  it('filters with OR inside a facet and AND across facets', () => {
    expect(run({ shape: 'round,square' }).total).toBe(3);
    expect(run({ shape: 'round', material: 'metal' }).ids).toEqual(['c']);
  });

  it('computes disjunctive facet counts and a price range', () => {
    const { facets } = run({ shape: 'round' });
    expect(facets.shape).toEqual([
      { value: 'round', count: 2 },
      { value: 'aviator', count: 1 },
      { value: 'square', count: 1 },
    ]);
    expect(facets.material).toEqual([
      { value: 'acetate', count: 1 },
      { value: 'metal', count: 1 },
    ]);
    expect(facets.collection).toEqual([
      { value: 'classics', count: 1, label: 'Everyday classics' },
    ]);
    expect(facets.price).toEqual({ minMinor: 1_500_00, maxMinor: 3_000_00 });
  });

  it('filters by face shape and counts face-shape facets', () => {
    const result = run({ faceShape: 'square' });
    expect(result.ids).toEqual(['a']);
    expect(result.facets.faceShape).toEqual([
      { value: 'oval', count: 1 },
      { value: 'square', count: 1 },
    ]);
  });

  it('requires every selected feature', () => {
    expect(run({ feature: 'lightweight' }).ids).toEqual(['a']);
    expect(run({ feature: 'lightweight,nose-pads' }).total).toBe(0);
  });

  it('filters by price, rating, stock and category', () => {
    expect(run({ minPrice: '200000', maxPrice: '300000' }).ids.sort()).toEqual(['b', 'c']);
    expect(run({ minRating: '4' }).ids).not.toContain('d');
    expect(run({ inStock: 'true' }).ids).not.toContain('c');
    expect(run({ category: 'sunglasses' }).ids).toEqual(['d']);
    expect(run({ colour: 'gold' }).ids).toEqual(['b']);
  });

  it('sorts recommended by stock then popularity, and by relevance when searching', () => {
    expect(run({}).ids).toEqual(['d', 'a', 'b', 'c']);
    expect(
      run(
        {},
        new Map([
          ['c', 5],
          ['b', 9],
        ]),
      ).ids,
    ).toEqual(['b', 'c']);
  });

  it('sorts by newest, price and rating', () => {
    expect(run({ sort: 'newest' }).ids).toEqual(['b', 'c', 'd', 'a']);
    expect(run({ sort: 'price-asc' }).ids).toEqual(['a', 'b', 'c', 'd']);
    expect(run({ sort: 'price-desc' }).ids[0]).toBe('d');
    expect(run({ sort: 'rating' }).ids[0]).toBe('b');
  });

  it('paginates', () => {
    expect(run({ pageSize: '2', page: '2' }).ids).toEqual(['b', 'c']);
    expect(run({ pageSize: '2', page: '3' }).ids).toEqual([]);
  });
});

describe('relatedEntries', () => {
  it('prefers the same shape and material within the category', () => {
    expect(relatedEntries(index, 'a').map((item) => item.id)).toEqual(['c', 'b']);
  });

  it('returns nothing for unknown products', () => {
    expect(relatedEntries(index, 'zzz')).toEqual([]);
  });
});
