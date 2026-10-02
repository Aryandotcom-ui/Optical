import type { MetadataRoute } from 'next';
import { getEnv } from '@/env';

export default function robots(): MetadataRoute.Robots {
  const base = getEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Personal, internal or endlessly parameterised pages.
      disallow: ['/dev/', '/status', '/search', '/wishlist', '/compare'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
