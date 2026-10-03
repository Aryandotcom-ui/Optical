import { brand } from '@optical/config/brand';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers/providers';
import { getEnv } from '@/env';
import './globals.css';

/**
 * Message namespaces that client components read. Only these are sent to
 * the browser; server components read the rest directly.
 */
const CLIENT_NAMESPACES = [
  'common',
  'error',
  'product',
  'wishlist',
  'compare',
  'search',
  'shell',
  'filters',
  'listing',
  'pdp',
  'wishlistPage',
  'comparePage',
  // Try-on opens over product pages and listings, so its strings go everywhere.
  'tryOn',
] as const;

const inter = localFont({
  src: './fonts/InterVariable-latin.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: 'Arial',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    metadataBase: new URL(getEnv().NEXT_PUBLIC_SITE_URL),
    title: {
      default: t('defaultTitle', { brand: brand.name, tagline: brand.tagline }),
      template: t('titleTemplate', { brand: brand.name }),
    },
    description: brand.description,
    applicationName: brand.name,
    openGraph: { siteName: brand.name, type: 'website' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: brand.themeColor.light },
    { media: '(prefers-color-scheme: dark)', color: brand.themeColor.dark },
  ],
  colorScheme: 'light dark',
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [t, messages] = await Promise.all([getTranslations('common'), getMessages()]);
  const clientMessages = {
    ...Object.fromEntries(CLIENT_NAMESPACES.map((namespace) => [namespace, messages[namespace]])),
    // The home page's only client string is the hero's pause button.
    home: { hero: { pause: messages.home.hero.pause } },
  };
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="bg-background text-ink">
        <a
          href="#main"
          className="sr-only rounded-pill bg-accent-strong px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider messages={clientMessages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
