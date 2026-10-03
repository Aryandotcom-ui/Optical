import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FinderQuestion } from '@/components/frame-finder/finder-question';
import { FinderResults } from '@/components/frame-finder/finder-results';
import { WithMessages } from '@/components/providers/with-messages';
import { getRecommendations } from '@/lib/catalog';
import { parseFinderParams } from '@/lib/finder-params';
import { notFound } from 'next/navigation';
import { getStoreSettings } from '@/lib/store-settings';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [t, params, settings] = await Promise.all([
    getTranslations('frameFinder'),
    searchParams,
    getStoreSettings(),
  ]);
  if (!settings.flags.frameFinder) notFound();
  const answered = Object.keys(params).length > 0;
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: '/frame-finder' },
    // Every set of answers is its own URL; only the start page belongs in search.
    ...(answered ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Frame Finder: five optional questions, then every frame ranked with the
 * reasons it matches. The whole state lives in the URL.
 */
export default async function FrameFinderPage({ searchParams }: { searchParams: SearchParams }) {
  const [t, params] = await Promise.all([getTranslations('frameFinder'), searchParams]);
  const { answers, step, results } = parseFinderParams(params);
  const recommendations = results ? await getRecommendations(answers) : null;

  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-ink-secondary">{t('intro')}</p>
      <div className="mt-10">
        {results ? (
          <FinderResults answers={answers} results={recommendations} />
        ) : (
          <div className="max-w-3xl">
            {/* The camera face-shape detector is the only client part. */}
            <WithMessages namespaces={['frameFinder']}>
              <FinderQuestion answers={answers} step={step} />
            </WithMessages>
          </div>
        )}
      </div>
    </div>
  );
}
