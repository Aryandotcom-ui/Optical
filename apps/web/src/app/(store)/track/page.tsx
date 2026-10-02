import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TrackForm } from '@/components/order/track-form';
import { WithMessages } from '@/components/providers/with-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('track');
  return { title: t('title'), description: t('intro'), alternates: { canonical: '/track' } };
}

export default async function TrackPage() {
  const t = await getTranslations('track');
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-ink-secondary">{t('intro')}</p>
      <div className="mt-8">
        <WithMessages namespaces={['track', 'checkout']}>
          <TrackForm />
        </WithMessages>
      </div>
    </div>
  );
}
