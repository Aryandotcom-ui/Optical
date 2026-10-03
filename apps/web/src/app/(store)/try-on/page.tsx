import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TryOnPage } from '@/components/try-on/try-on-page';
import { getStoreSettings } from '@/lib/store-settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tryOn');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    // ?frames= lists are session state, not separate pages.
    alternates: { canonical: '/try-on' },
  };
}

const SLUG = /^[a-z0-9-]{1,80}$/;

export default async function TryOnRoute({
  searchParams,
}: {
  searchParams: Promise<{ frames?: string | string[]; frame?: string | string[] }>;
}) {
  const [t, params, settings] = await Promise.all([
    getTranslations('tryOn'),
    searchParams,
    getStoreSettings(),
  ]);
  // Switched off in the admin: the page is gone until it is switched back on.
  if (!settings.flags.virtualTryOn) notFound();
  const frames = (typeof params.frames === 'string' ? params.frames.split(',') : [])
    .filter((slug) => SLUG.test(slug))
    .slice(0, 12);
  const frame =
    typeof params.frame === 'string' && SLUG.test(params.frame) ? params.frame : undefined;
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-ink-secondary">{t('intro')}</p>
      <div className="mt-8">
        <TryOnPage frames={frames} frame={frame} />
      </div>
    </div>
  );
}
