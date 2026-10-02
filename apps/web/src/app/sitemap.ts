import { MAX_PAGE_SIZE } from '@optical/shared/catalog';
import type { MetadataRoute } from 'next';
import { legalSlugs } from '@/content/legal';
import { getEnv } from '@/env';
import { getCategories, getCollections, getListing } from '@/lib/catalog';

// Built per request (and cached by the data layer), so a build without the API still works.
export const dynamic = 'force-dynamic';

const STATIC_PATHS = [
  '/',
  '/shop',
  '/help',
  '/help/size-guide',
  '/help/prescription',
  '/help/returns',
];

async function allProductSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const listing = await getListing({ page, pageSize: MAX_PAGE_SIZE });
    slugs.push(...listing.items.map((item) => item.slug));
    if (page * MAX_PAGE_SIZE >= listing.total) break;
  }
  return slugs;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  const url = (path: string) => `${base}${path}`;
  const entries: MetadataRoute.Sitemap = [
    ...STATIC_PATHS.map((path) => ({
      url: url(path),
      changeFrequency: 'weekly' as const,
      priority: path === '/' ? 1 : 0.6,
    })),
    ...legalSlugs.map((slug) => ({
      url: url(`/legal/${slug}`),
      changeFrequency: 'yearly' as const,
      priority: 0.2,
    })),
  ];
  try {
    const [categories, collections, products] = await Promise.all([
      getCategories(),
      getCollections(),
      allProductSlugs(),
    ]);
    entries.push(
      ...categories
        .filter((category) => category.productCount > 0)
        .map((category) => ({
          url: url(`/shop/${category.slug}`),
          changeFrequency: 'daily' as const,
          priority: 0.8,
        })),
      ...collections.map((collection) => ({
        url: url(`/collections/${collection.slug}`),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
      ...products.map((slug) => ({
        url: url(`/p/${slug}`),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    );
  } catch {
    // The catalogue is unavailable: serve the static pages rather than an error.
  }
  return entries;
}
