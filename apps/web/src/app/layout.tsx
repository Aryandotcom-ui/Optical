import { brand } from '@optical/config/brand';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getEnv } from '@/env';
import './globals.css';

const inter = localFont({
  src: './fonts/InterVariable-latin.woff2',
  weight: '100 900',
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
  const t = await getTranslations('common');
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="bg-background text-ink">
        <a
          href="#main"
          className="sr-only rounded-pill bg-accent-strong px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
