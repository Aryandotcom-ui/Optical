'use client';

import type { OrderList, SavedPrescription } from '@optical/shared/account';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { accountApi } from '@/lib/account-api';
import { useSession } from '@/lib/session';
import { LoadError, LoadingBlock } from './load-states';
import { OrderRows } from './order-list';
import { useLoad } from './use-load';

const loadOverview = async (): Promise<{
  orders: OrderList;
  prescriptions: SavedPrescription[];
}> => {
  const [orders, prescriptions] = await Promise.all([
    accountApi.orders(1),
    accountApi.prescriptions(),
  ]);
  return { orders, prescriptions };
};

export function AccountOverview() {
  const t = useTranslations('account.overview');
  const session = useSession();
  const { state, reload } = useLoad(loadOverview);
  const name = session.status === 'signed-in' ? session.user.name.split(/\s+/)[0] : '';

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-display-md font-semibold tracking-tight">
          {t('greeting', { name: name ?? '' })}
        </h1>
        <p className="mt-2 text-ink-secondary">{t('intro')}</p>
      </header>
      {state.status === 'loading' ? <LoadingBlock /> : null}
      {state.status === 'error' ? <LoadError onRetry={reload} /> : null}
      {state.status === 'ready' ? (
        <>
          {(() => {
            const due = state.data.prescriptions.filter(
              (entry) => entry.expiry === 'expiring' || entry.expiry === 'expired',
            ).length;
            return due > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-warning/12 p-4 text-warning-ink">
                <p>{t('rxAlert', { count: due })}</p>
                <Link
                  href="/account/prescriptions"
                  className="font-medium underline underline-offset-4"
                >
                  {t('rxAlertLink')}
                </Link>
              </div>
            ) : null;
          })()}
          <section aria-labelledby="recent-orders" className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="recent-orders" className="text-title font-semibold">
                {t('recentOrders')}
              </h2>
              {state.data.orders.total > 3 ? (
                <Link
                  href="/account/orders"
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {t('allOrders')}
                </Link>
              ) : null}
            </div>
            {state.data.orders.items.length ? (
              <OrderRows orders={state.data.orders.items.slice(0, 3)} />
            ) : (
              <div className="space-y-4 rounded-card bg-surface-muted p-6">
                <p className="text-ink-secondary">{t('noOrders')}</p>
                <Button asChild>
                  <Link href="/shop">{t('shop')}</Link>
                </Button>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
