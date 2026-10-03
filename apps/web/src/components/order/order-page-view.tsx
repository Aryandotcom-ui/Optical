'use client';

import type { OrderView } from '@optical/shared/checkout';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CommerceError, commerceApi } from '@/lib/commerce-api';
import { hasSignedInHint, useSignedInHint } from '@/lib/signed-in';
import { MockPayment } from './mock-payment';
import { OrderDetails } from './order-details';
import { OrderStatusHero, orderPhase } from './order-status-hero';
import { OrderTimeline } from './order-timeline';

// The prescription form (with the validation rules) loads only when a prescription is missing.
const AddPrescription = dynamic(() =>
  import('./add-prescription').then((module) => module.AddPrescription),
);

// Order self-service and the account offer load only on order pages that show them.
const OrderActions = dynamic(() => import('./order-actions').then((module) => module.OrderActions));
const CreateAccount = dynamic(() =>
  import('./create-account').then((module) => module.CreateAccount),
);

/** Stop asking after this long; a payment that takes longer arrives by email. */
const POLL_LIMIT_MS = 3 * 60_000;
const POLL_EVERY_MS = 1_500;

type State =
  | { status: 'loading' }
  | { status: 'missing'; message: string }
  | { status: 'ready'; order: OrderView };

/**
 * The order page, for its account or behind its private link: confirmation,
 * live payment status (it follows the provider's webhook), retrying a failed
 * payment, adding a prescription, the timeline, and cancel/return/reorder.
 */
export function OrderPageView({ number, token }: { number: string; token: string }) {
  const t = useTranslations('order');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [watchingSince, setWatchingSince] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const signedIn = useSignedInHint();
  // Decided once, when the order first loads, so the offer stays to confirm once it is accepted.
  const [offerAccount, setOfferAccount] = useState<boolean | null>(null);

  const load = useCallback(
    () =>
      commerceApi.order(number, token).then(
        (order) => {
          setState({ status: 'ready', order });
          setOfferAccount((previous) => previous ?? !hasSignedInHint());
        },
        (error: unknown) => {
          if (error instanceof CommerceError && error.status === 404)
            setState({ status: 'missing', message: error.message });
        },
      ),
    [number, token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const order = state.status === 'ready' ? state.order : null;
  const phase = order ? orderPhase(order) : null;
  // Follow the payment while the provider is still deciding.
  const shouldWatch =
    phase === 'processing' ||
    (phase === 'awaiting-payment' && order?.paymentProvider !== 'mock') ||
    (watchingSince !== null && phase === 'awaiting-payment');
  useEffect(() => {
    if (!shouldWatch) return;
    const started = watchingSince ?? Date.now();
    if (Date.now() - started > POLL_LIMIT_MS) return;
    const timer = setTimeout(() => {
      void load();
    }, POLL_EVERY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [shouldWatch, watchingSince, load, state]);

  // A confirmed order empties the bag on the server; bring the header count up to date.
  const confirmed = phase === 'confirmed';
  useEffect(() => {
    if (confirmed) commerceApi.cart().catch(() => undefined);
  }, [confirmed]);

  const retry = async () => {
    if (!order) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const placed = await commerceApi.retryPayment(order.number, token, order.paymentProvider);
      if (placed.payment?.kind === 'redirect') {
        window.location.assign(placed.payment.url);
        return;
      }
      setWatchingSince(null);
      setState({ status: 'ready', order: placed.order });
    } catch (error) {
      setRetryError(error instanceof CommerceError ? error.message : t('retryFailed'));
    } finally {
      setRetrying(false);
    }
  };

  if (state.status === 'loading') return <Skeleton className="h-96 w-full rounded-card" />;
  if (state.status === 'missing' || !order || !phase)
    return (
      <div className="space-y-4">
        <h1 className="text-display-md font-semibold">{t('missingTitle')}</h1>
        <p className="text-ink-secondary">{state.status === 'missing' ? state.message : null}</p>
        <Button asChild variant="secondary">
          <Link href="/track">{t('trackInstead')}</Link>
        </Button>
      </div>
    );

  const needingRx = order.items.filter((item) => item.prescription && !item.prescription.provided);
  const showMock =
    order.paymentProvider === 'mock' &&
    phase === 'awaiting-payment' &&
    order.payment?.status === 'CREATED' &&
    watchingSince === null;

  return (
    <div className="space-y-10">
      <OrderStatusHero order={order} phase={phase} />
      <p aria-live="polite" className="sr-only">
        {order.statusLabel}
      </p>

      {showMock && order.payment ? (
        <MockPayment
          paymentId={order.payment.id}
          token={token}
          onSent={(next) => {
            setState({ status: 'ready', order: next });
            setWatchingSince(Date.now());
          }}
        />
      ) : null}
      {phase === 'awaiting-payment' && !showMock ? (
        <p className="text-ink-secondary">{t('waitingForPayment')}</p>
      ) : null}

      {order.canRetryPayment &&
      (phase === 'failed' ||
        (phase === 'awaiting-payment' && order.payment?.status === 'FAILED')) ? (
        <div className="space-y-2">
          <Button size="lg" disabled={retrying} onClick={() => void retry()}>
            {retrying ? t('retrying') : t('retry')}
          </Button>
          {order.reservedUntil ? (
            <p className="text-caption text-ink-secondary">{t('held')}</p>
          ) : null}
          <p aria-live="polite" className="text-caption text-danger-ink">
            {retryError}
          </p>
        </div>
      ) : null}

      {needingRx.length > 0 && phase !== 'cancelled' ? (
        <section
          aria-labelledby="rx-needed"
          className="space-y-4 rounded-card bg-surface-muted p-6"
        >
          <h2 id="rx-needed" className="text-title font-semibold">
            {t('prescription.title')}
          </h2>
          <p className="text-ink-secondary">{t('prescription.body')}</p>
          {needingRx.map((item) => (
            <AddPrescription
              key={item.id}
              number={order.number}
              token={token}
              item={item}
              requiresAdd={item.prescription?.requiresAdd ?? false}
              onAdded={(next) => {
                setState({ status: 'ready', order: next });
              }}
            />
          ))}
        </section>
      ) : null}

      {token && offerAccount && phase === 'confirmed' ? (
        <CreateAccount number={order.number} token={token} email={order.email} />
      ) : null}

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <OrderDetails order={order} />
        <OrderTimeline order={order} />
      </div>

      <OrderActions
        order={order}
        token={token}
        onChange={(next) => {
          setState({ status: 'ready', order: next });
        }}
      />

      <div className="flex flex-wrap gap-3">
        {signedIn ? (
          <Button asChild variant="secondary">
            <Link href="/account/orders">{t('backToOrders')}</Link>
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <Link href="/shop">{t('keepShopping')}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/help/returns">{t('help')}</Link>
        </Button>
      </div>
    </div>
  );
}
