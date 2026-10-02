import { brand } from '@optical/config/brand';
import { commerce } from '@optical/config/commerce';
import type { ProductDetail } from '@optical/shared/catalog';

const availability = {
  'in-stock': 'https://schema.org/InStock',
  'low-stock': 'https://schema.org/LimitedAvailability',
  'out-of-stock': 'https://schema.org/OutOfStock',
} as const;

/** schema.org Product with one Offer per colour, for rich results. */
export function productJsonLd(product: ProductDetail, siteUrl: string): Record<string, unknown> {
  const url = new URL(`/p/${product.slug}`, siteUrl).toString();
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.seo.description,
    url,
    sku: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: brand.name },
    image: product.variants
      .flatMap((variant) => variant.images.slice(0, 1))
      .map((image) => new URL(image.url, siteUrl).toString()),
    offers: product.variants.map((variant) => ({
      '@type': 'Offer',
      sku: variant.sku,
      name: `${product.name}, ${variant.colourName}`,
      price: (variant.priceMinor / commerce.minorUnitsPerMajor).toFixed(2),
      priceCurrency: commerce.currency,
      availability: availability[variant.stockState],
      itemCondition: 'https://schema.org/NewCondition',
      url: variant.id === product.defaultVariantId ? url : `${url}?colour=${variant.id}`,
    })),
    ...(product.rating.average !== null && product.rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating.average,
            reviewCount: product.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/** Serialises JSON-LD safely for a <script> tag (no `</script>` break-out). */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
