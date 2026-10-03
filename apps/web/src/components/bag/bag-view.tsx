'use client';

import type { Cart } from '@optical/shared/checkout';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CommerceError, commerceApi } from '@/lib/commerce-api';
import { BagItem } from './bag-item';
import { CouponForm } from './coupon-form';
import { OrderSummary } from './order-summary';

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; cart: Cart };

/** The bag: lines, quantities, coupon and summary, always as the server prices them. */
export function BagView() {
  const t = useTranslations('bag');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    commerceApi.cart().then(
      (cart) => {
        setState({ status: 'ready', cart });
      },
      (error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof CommerceError ? error.message : t('loadFailed'),
        });
      },
    );
  };
  useEffect(load, [t]);

  const change = async (request: () => Promise<Cart>) => {
    setBusy(true);
    setNotice(null);
    try {
      setState({ status: 'ready', cart: await request() });
    } catch (error) {
      setNotice(error instanceof CommerceError ? error.message : t('changeFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading')
    return (
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-64 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="space-y-4">
        <p className="text-danger-ink">{state.message}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setState({ status: 'loading' });
            load();
          }}
        >
          {t('retry')}
        </Button>
      </div>
    );

  const { cart } = state;
  if (cart.items.length === 0)
    return (
      <div className="rounded-media bg-surface-muted px-6 py-16 text-center">
        <ShoppingBag
          aria-hidden="true"
          className="mx-auto size-8 text-ink-secondary"
          strokeWidth={1.5}
        />
        <h2 className="mt-4 text-headline font-semibold">{t('emptyTitle')}</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-secondary">{t('emptyBody')}</p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/shop">{t('browse')}</Link>
        </Button>
      </div>
    );

  const blocked = cart.items.some((item) => item.issue !== null);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="bag-items">
        <h2 id="bag-items" className="sr-only">
          {t('itemsHeading', { count: cart.itemCount })}
        </h2>
        <p aria-live="polite" className="text-caption text-danger-ink empty:hidden">
          {notice}
        </p>
        <ul className="divide-y divide-hairline border-y border-hairline">
          {cart.items.map((item) => (
            <BagItem
              key={item.id}
              item={item}
              busy={busy}
              onQuantity={(quantity) =>
                void change(() => commerceApi.updateQuantity(item.id, quantity))
              }
              onRemove={() => void change(() => commerceApi.removeItem(item.id))}
            />
          ))}
        </ul>
      </section>
      <aside
        aria-labelledby="bag-summary"
        className="h-fit space-y-6 rounded-card bg-surface-muted p-6 lg:sticky lg:top-24"
      >
        <h2 id="bag-summary" className="text-title font-semibold">
          {t('summaryHeading')}
        </h2>
        <OrderSummary pricing={cart.pricing} deliveryKnown={false} />
        <CouponForm
          applied={cart.couponCode}
          onApply={async (code) => {
            // Errors stay with the coupon field, which shows the server's reason.
            setState({ status: 'ready', cart: await commerceApi.applyCoupon(code) });
          }}
          onRemove={() => change(() => commerceApi.removeCoupon())}
        />
        {blocked ? <p className="text-caption text-danger-ink">{t('fixIssues')}</p> : null}
        {blocked ? (
          <Button size="lg" className="w-full" disabled>
            {t('checkout')}
          </Button>
        ) : (
          <Button asChild size="lg" className="w-full">
            <Link href="/checkout">{t('checkout')}</Link>
          </Button>
        )}
        <p className="text-caption text-ink-secondary">{t('reassurance')}</p>
      </aside>
    </div>
  );
}
