import type { ProductDetail } from '@optical/shared/catalog';
import { describe, expect, it } from 'vitest';
import { listingRobots } from './seo';
import { jsonLdScript, productJsonLd, siteJsonLd } from './structured-data';

describe('listingRobots', () => {
  it('indexes clean listings and sorted or paged views', () => {
    expect(listingRobots('/shop', {})).toEqual({ alternates: { canonical: '/shop' } });
    expect(listingRobots('/shop', { sort: 'newest', page: '2' }).robots).toBeUndefined();
  });

  it('keeps filtered variants out of the index but followable', () => {
    expect(listingRobots('/shop/eyeglasses', { shape: 'round' })).toEqual({
      alternates: { canonical: '/shop/eyeglasses' },
      robots: { index: false, follow: true },
    });
  });
});

const image = {
  url: '/renders/a/a-front.webp',
  alt: 'A',
  width: 1200,
  height: 900,
  kind: 'front' as const,
};
const variant = (id: string, stockState: 'in-stock' | 'low-stock' | 'out-of-stock') => ({
  id,
  sku: `SKU-${id}`,
  colourName: `Colour ${id}`,
  colourFamily: 'black' as const,
  swatchHex: '#111111',
  finish: 'glossy' as const,
  images: [image],
  stockState,
  lowStockCount: stockState === 'low-stock' ? 2 : null,
  priceMinor: 249_000,
  secondaryHex: null,
  hardwareHex: null,
  lensTintHex: null,
});
const product = {
  id: 'p1',
  slug: 'harbour',
  name: 'Harbour',
  defaultVariantId: 'v1',
  variants: [variant('v1', 'in-stock'), variant('v2', 'out-of-stock')],
  rating: { average: 4.2, count: 5 },
  seo: { title: 'Harbour', description: 'Round acetate frames.' },
} as unknown as ProductDetail;

describe('productJsonLd', () => {
  it('describes one offer per colour with honest availability', () => {
    const data = productJsonLd(product, 'https://shop.example');
    expect(data).toMatchObject({
      '@type': 'Product',
      name: 'Harbour',
      url: 'https://shop.example/p/harbour',
    });
    const offers = data.offers as {
      price: string;
      priceCurrency: string;
      availability: string;
      url: string;
    }[];
    expect(offers.map((offer) => offer.availability)).toEqual([
      'https://schema.org/InStock',
      'https://schema.org/OutOfStock',
    ]);
    expect(offers[0]).toMatchObject({
      price: '2490.00',
      priceCurrency: 'INR',
      url: 'https://shop.example/p/harbour',
    });
    expect(offers[1]?.url).toBe('https://shop.example/p/harbour?colour=v2');
    expect(data.aggregateRating).toMatchObject({ ratingValue: 4.2, reviewCount: 5 });
  });

  it('omits the rating when there are no reviews', () => {
    const data = productJsonLd(
      { ...product, rating: { average: null, count: 0 } },
      'https://shop.example',
    );
    expect(data.aggregateRating).toBeUndefined();
  });

  it('escapes markup so the script tag cannot be closed early', () => {
    expect(jsonLdScript({ name: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});

describe('siteJsonLd', () => {
  it('describes the store and its search for rich results', () => {
    const data = siteJsonLd('https://shop.example/');
    const graph = data['@graph'] as {
      '@type': string;
      potentialAction?: { target: { urlTemplate: string } };
    }[];
    expect(graph.map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);
    expect(graph[1]?.potentialAction?.target.urlTemplate).toBe(
      'https://shop.example/search?q={search_term_string}',
    );
  });
});
