import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OrderPageView } from '@/components/order/order-page-view';
import { WithMessages } from '@/components/providers/with-messages';

interface Props {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('order');
  // Private page: never indexed, and the link's token never leaks in a Referer header.
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ number }, { token }] = await Promise.all([params, searchParams]);
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <WithMessages namespaces={['order', 'configurator']}>
        <OrderPageView
          number={decodeURIComponent(number).toUpperCase()}
          token={typeof token === 'string' ? token : ''}
        />
      </WithMessages>
    </div>
  );
}
