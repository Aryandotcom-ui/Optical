import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CompareView } from '@/components/saved/compare-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('comparePage');
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function ComparePage() {
  const t = await getTranslations('comparePage');
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <h1 className="text-display-md font-semibold">{t('title')}</h1>
      <p className="mt-3 max-w-prose text-ink-secondary">{t('intro')}</p>
      <div className="mt-8">
        <CompareView />
      </div>
    </div>
  );
}
