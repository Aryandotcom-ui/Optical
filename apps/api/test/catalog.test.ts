import {
  productDetailSchema,
  productListingSchema,
  reviewListSchema,
  searchSuggestionSchema,
  type ProductListing,
} from '@optical/shared/catalog';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDbTestApp } from './helpers';

type App = Awaited<ReturnType<typeof buildDbTestApp>>['app'];
let app: App;

beforeAll(async () => {
  app = (await buildDbTestApp()).app;
});
afterAll(async () => {
  await app.close();
});

async function list(query = ''): Promise<ProductListing> {
  const response = await app.inject({ method: 'GET', url: `/v1/products${query}` });
  expect(response.statusCode, response.payload).toBe(200);
  return productListingSchema.parse(response.json());
}

describe('GET /v1/products', () => {
  it('lists the whole published catalogue with the default page size', async () => {
    const result = await list();
    expect(result.total).toBe(69);
    expect(result.items).toHaveLength(24);
    expect(result.page).toBe(1);
    expect(result.facets.category.find((option) => option.value === 'eyeglasses')?.count).toBe(36);
  });

  it('is cacheable by shared caches', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/products' });
    expect(response.headers['cache-control']).toContain('public');
  });

  it('filters by category and multi-select shape (OR within a facet)', async () => {
    const result = await list('?category=eyeglasses&shape=round,square&pageSize=48');
    expect(result.items.length).toBe(result.total);
    expect(
      result.items.every(
        (item) => item.category === 'eyeglasses' && ['round', 'square'].includes(item.shape ?? ''),
      ),
    ).toBe(true);
    expect(result.total).toBeGreaterThan(5);
  });

  it('keeps facet counts disjunctive', async () => {
    const all = await list('?category=eyeglasses');
    const round = await list('?category=eyeglasses&shape=round');
    // Selecting "round" must not collapse the other shape options.
    expect(round.facets.shape).toEqual(all.facets.shape);
    expect(round.total).toBe(all.facets.shape.find((option) => option.value === 'round')?.count);
  });

  it('filters by colour family, material, price range and features', async () => {
    const gold = await list('?colour=gold&pageSize=48');
    expect(
      gold.items.every((item) => item.variants.some((variant) => variant.colourFamily === 'gold')),
    ).toBe(true);

    const titanium = await list('?material=titanium');
    expect(titanium.items.every((item) => item.material === 'titanium')).toBe(true);

    const cheap = await list('?minPrice=100000&maxPrice=200000&pageSize=48');
    expect(
      cheap.items.every((item) => item.priceMinor >= 100000 && item.priceMinor <= 200000),
    ).toBe(true);
    expect(cheap.total).toBeGreaterThan(0);

    const light = await list('?feature=lightweight,nose-pads');
    expect(light.total).toBeGreaterThan(0);
  });

  it('sorts by price and newest', async () => {
    const ascending = await list('?sort=price-asc&pageSize=48');
    const prices = ascending.items.map((item) => item.priceMinor);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    const descending = await list('?sort=price-desc');
    expect(descending.items[0]!.priceMinor).toBeGreaterThanOrEqual(descending.items[1]!.priceMinor);
  });

  it('paginates without overlap', async () => {
    const first = await list('?pageSize=10&page=1');
    const second = await list('?pageSize=10&page=2');
    const ids = new Set(first.items.map((item) => item.id));
    expect(second.items.some((item) => ids.has(item.id))).toBe(false);
    expect(second.page).toBe(2);
  });

  it('searches with stemming, prefixes and typos', async () => {
    const aviators = await list('?q=aviator');
    expect(aviators.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Kestrel', 'Pike', 'Zephyr']),
    );
    expect((await list('?q=avia')).total).toBeGreaterThanOrEqual(aviators.total);
    expect((await list('?q=harbor')).items[0]?.name).toBe('Harbour');
    expect(
      (await list('?q=titanium%20gold')).items.every((item) => item.material === 'titanium'),
    ).toBe(true);
    const response = await app.inject({ method: 'GET', url: '/v1/products?q=aviator' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns an empty page, not an error, when nothing matches', async () => {
    const result = await list('?q=zzzzqqqq');
    expect(result).toMatchObject({ total: 0, items: [] });
  });

  it('only reveals exact stock counts when stock is genuinely low', async () => {
    const result = await list('?pageSize=48&page=1');
    for (const variant of result.items.flatMap((item) => item.variants)) {
      if (variant.stockState === 'low-stock') expect(variant.lowStockCount).toBeLessThanOrEqual(3);
      else expect(variant.lowStockCount).toBeNull();
    }
  });

  it('rejects unknown filter values with field details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/products?shape=triangle&sort=cheapest',
    });
    expect(response.statusCode).toBe(422);
    const paths = response
      .json<{ error: { details: { path: string }[] } }>()
      .error.details.map((detail) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['querystring.shape.0', 'querystring.sort']));
  });
});

describe('GET /v1/products/:slug', () => {
  it('returns full product detail with measurements and face-shape fit', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/products/harbour' });
    expect(response.statusCode).toBe(200);
    const product = productDetailSchema.parse(response.json());
    expect(product).toMatchObject({
      name: 'Harbour',
      category: 'eyeglasses',
      shape: 'round',
      lensesAvailable: true,
    });
    expect(product.frame).toMatchObject({ lensWidthMm: 48, bridgeMm: 21, templeMm: 145 });
    expect(product.faceShapes[0]?.faceShape).toBe('square');
    expect(product.variants[0]?.images.map((image) => image.kind)).toEqual([
      'front',
      'angle',
      'side',
    ]);
    expect(product.collections.map((collection) => collection.slug)).toContain('everyday-classics');
  });

  it('marks accessories as sold without lenses', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/products/lens-care-kit' });
    expect(productDetailSchema.parse(response.json())).toMatchObject({
      productType: 'accessory',
      lensesAvailable: false,
      frame: null,
    });
  });

  it('returns 404 with a helpful message for unknown products', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/products/no-such-frame' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: expect.stringContaining('renamed or retired') as string,
      },
    });
  });
});

describe('face-shape filter', () => {
  it('returns frames that suit the chosen face shape', async () => {
    const result = await list('?faceShape=round&category=eyeglasses&pageSize=48');
    expect(result.total).toBeGreaterThan(5);
    // Round frames do not suit round faces, so none should appear.
    expect(result.items.some((item) => item.shape === 'round')).toBe(false);
    expect(result.facets.faceShape.map((option) => option.value)).toContain('square');
  });
});

describe('GET /v1/products/by-ids', () => {
  it('returns cards in the requested order and skips unknown ids', async () => {
    const harbour = productDetailSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/products/harbour' })).json(),
    );
    const pike = productDetailSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/products/pike' })).json(),
    );
    const unknown = '0192f4c8-0000-7000-8000-000000000000';
    const response = await app.inject({
      method: 'GET',
      url: `/v1/products/by-ids?ids=${pike.id},${unknown},${harbour.id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: { name: string }[] }>().items.map((item) => item.name)).toEqual([
      'Pike',
      'Harbour',
    ]);
  });

  it('rejects malformed ids', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/v1/products/by-ids?ids=nope' })).statusCode,
    ).toBe(422);
  });
});

describe('GET /v1/products/:id/reviews', () => {
  it('returns published reviews with a histogram that matches the summary', async () => {
    const product = productDetailSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/products/harbour' })).json(),
    );
    const response = await app.inject({
      method: 'GET',
      url: `/v1/products/${product.id}/reviews?sort=rating-low`,
    });
    expect(response.statusCode).toBe(200);
    const reviews = reviewListSchema.parse(response.json());
    const histogramTotal = Object.values(reviews.summary.histogram).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(histogramTotal).toBe(reviews.summary.count);
    expect(reviews.summary.count).toBe(product.rating.count);
    expect(reviews.summary.average).toBe(product.rating.average);
    const ratings = reviews.items.map((review) => review.rating);
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
    expect(reviews.items.some((review) => review.verifiedPurchase)).toBe(true);
  });

  it('404s for unknown products', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/0192f4c8-0000-7000-8000-000000000000/reviews',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('help articles', () => {
  it('lists articles and returns one by slug', async () => {
    const list = await app.inject({ method: 'GET', url: '/v1/help/articles' });
    const items = list.json<{ items: { slug: string; topic: string }[] }>().items;
    expect(items.length).toBe(12);
    const article = await app.inject({ method: 'GET', url: '/v1/help/articles/returns' });
    expect(article.json<{ title: string }>().title).toBe('How do returns work?');
    expect((await app.inject({ method: 'GET', url: '/v1/help/articles/nope' })).statusCode).toBe(
      404,
    );
  });
});

describe('GET /v1/products/:id/related', () => {
  it('suggests similar products from the same category', async () => {
    const product = productDetailSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/products/wren' })).json(),
    );
    const response = await app.inject({ method: 'GET', url: `/v1/products/${product.id}/related` });
    const { items } = response.json<{
      items: { id: string; category: string; shape: string }[];
    }>();
    expect(items.length).toBeGreaterThan(3);
    expect(items.every((item) => item.id !== product.id && item.category === 'eyeglasses')).toBe(
      true,
    );
    expect(items[0]?.shape).toBe('round');
  });

  it('404s for unknown ids', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/0192f4c8-0000-7000-8000-000000000000/related',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('categories and collections', () => {
  it('lists categories with live product counts', async () => {
    const { items } = (await app.inject({ method: 'GET', url: '/v1/categories' })).json<{
      items: { slug: string; productCount: number }[];
    }>();
    expect(items.map((item) => item.slug)).toEqual([
      'eyeglasses',
      'sunglasses',
      'computer-glasses',
      'kids',
      'accessories',
    ]);
    expect(items.reduce((sum, item) => sum + item.productCount, 0)).toBe(69);
  });

  it('returns a collection with products in editorial order', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/collections/featherweight' });
    const collection = response.json<{ name: string; products: { name: string }[] }>();
    expect(collection.name).toBe('Featherweight');
    expect(collection.products[0]?.name).toBe('Ulla');
  });

  it('lists collections with product counts', async () => {
    const { items } = (await app.inject({ method: 'GET', url: '/v1/collections' })).json<{
      items: { slug: string; productCount: number; isFeatured: boolean }[];
    }>();
    expect(items.map((item) => item.slug)).toEqual([
      'everyday-classics',
      'featherweight',
      'titanium',
      'sun-season',
      'screen-time',
      'statement',
    ]);
    expect(items.every((item) => item.productCount > 0)).toBe(true);
  });

  it('404s for unknown collections', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/collections/nope' })).statusCode).toBe(404);
  });
});

describe('GET /v1/search/suggest', () => {
  it('suggests products, categories, collections and help articles', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/search/suggest?q=sun' });
    const suggestions = searchSuggestionSchema.parse(response.json());
    expect(suggestions.products.length).toBeGreaterThan(0);
    expect(suggestions.categories.map((category) => category.slug)).toContain('sunglasses');
    expect(suggestions.collections.map((collection) => collection.slug)).toContain('sun-season');
  });

  it('finds help articles', async () => {
    const suggestions = searchSuggestionSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/search/suggest?q=prescription' })).json(),
    );
    expect(suggestions.articles.map((article) => article.slug)).toContain(
      'how-to-read-your-prescription',
    );
  });

  it('tolerates typos and returns nothing for an empty query', async () => {
    const typo = searchSuggestionSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/search/suggest?q=kestral' })).json(),
    );
    expect(typo.products[0]?.name).toBe('Kestrel');
    const empty = searchSuggestionSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/search/suggest?q=' })).json(),
    );
    expect(empty.products).toEqual([]);
  });

  it('ignores query syntax characters safely', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/search/suggest?q=${encodeURIComponent('\'); DROP TABLE "Product"; --')}`,
    });
    expect(response.statusCode).toBe(200);
  });
});
