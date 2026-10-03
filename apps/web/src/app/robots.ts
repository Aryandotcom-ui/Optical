import type { MetadataRoute } from 'next';
import { getEnv } from '@/env';

export default function robots(): MetadataRoute.Robots {
  const base = getEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Personal, internal or endlessly parameterised pages.
      disallow: [
        '/admin',
        '/dev/',
        '/status',
        '/search',
        '/wishlist',
        '/compare',
        '/cart',
        '/checkout',
        '/order/',
        '/account',
        '/sign-in',
        '/register',
        '/forgot-password',
        '/reset-password',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
