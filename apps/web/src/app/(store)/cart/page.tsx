import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BagView } from '@/components/bag/bag-view';
import { WithMessages } from '@/components/providers/with-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bag');
  return { title: t('title'), robots: { index: false } };
}

export default async function BagPage() {
  const t = await getTranslations('bag');
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
      <div className="mt-8">
        <WithMessages namespaces={['bag']}>
          <BagView />
        </WithMessages>
      </div>
    </div>
  );
}
