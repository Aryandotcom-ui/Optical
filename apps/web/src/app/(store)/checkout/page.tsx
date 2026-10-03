import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CheckoutView } from '@/components/checkout/checkout-view';
import { WithMessages } from '@/components/providers/with-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('checkout');
  return { title: t('title'), robots: { index: false } };
}

export default async function CheckoutPage() {
  const t = await getTranslations('checkout');
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-ink-secondary">{t('intro')}</p>
      <div className="mt-8">
        <WithMessages namespaces={['bag', 'checkout', 'configurator']}>
          <CheckoutView />
        </WithMessages>
      </div>
    </div>
  );
}
