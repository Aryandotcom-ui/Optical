'use client';

import type { OrderView } from '@optical/shared/checkout';
import { AlertCircle, Clock, PackageCheck, Undo2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatShortDate } from '@/lib/format';

export type OrderPhase =
  | 'confirmed'
  | 'awaiting-payment'
  | 'processing'
  | 'failed'
  | 'cancelled'
  | 'delivered'
  | 'returning';

export function orderPhase(order: OrderView): OrderPhase {
  const cancelled = order.timeline.some((step) => step.status === 'CANCELLED');
  if (order.status === 'CANCELLED' || (order.status === 'REFUNDED' && cancelled))
    return 'cancelled';
  if (['RETURN_REQUESTED', 'RETURNED', 'REFUNDED'].includes(order.status)) return 'returning';
  if (order.status === 'DELIVERED') return 'delivered';
  if (order.status === 'PAYMENT_FAILED') return 'failed';
  if (order.status === 'PENDING_PAYMENT' && order.paymentProvider !== 'cod')
    return order.payment?.status === 'PENDING'
      ? 'processing'
      : order.payment?.status === 'FAILED'
        ? 'failed'
        : 'awaiting-payment';
  return 'confirmed';
}

/** A drawn tick that animates in once (and simply appears with reduced motion). */
function SuccessMark() {
  return (
    <svg viewBox="0 0 52 52" className="size-14" aria-hidden="true">
      <circle
        cx="26"
        cy="26"
        r="24"
        className="success-ring fill-none stroke-success-ink"
        strokeWidth="3"
      />
      <path
        d="M15 27 l7 7 l15 -16"
        className="success-check fill-none stroke-success-ink"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OrderStatusHero({ order, phase }: { order: OrderView; phase: OrderPhase }) {
  const t = useTranslations('order.hero');
  const icon = {
    confirmed: <SuccessMark />,
    'awaiting-payment': (
      <Clock aria-hidden="true" className="size-12 text-ink-secondary" strokeWidth={1.5} />
    ),
    processing: <Clock aria-hidden="true" className="size-12 text-accent" strokeWidth={1.5} />,
    failed: (
      <AlertCircle aria-hidden="true" className="size-12 text-danger-ink" strokeWidth={1.5} />
    ),
    cancelled: (
      <XCircle aria-hidden="true" className="size-12 text-ink-secondary" strokeWidth={1.5} />
    ),
    delivered: (
      <PackageCheck aria-hidden="true" className="size-12 text-success-ink" strokeWidth={1.5} />
    ),
    returning: (
      <Undo2 aria-hidden="true" className="size-12 text-ink-secondary" strokeWidth={1.5} />
    ),
  }[phase];
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      {icon}
      <div>
        <h1 className="text-display-md font-semibold tracking-tight" tabIndex={-1}>
          {t(`${phase}.title`)}
        </h1>
        <p className="mt-1 text-ink-secondary">
          {t(`${phase}.body`, {
            number: order.number,
            email: order.email,
            reason: order.payment?.failureReason ?? '',
            status: order.statusLabel,
          })}
        </p>
        {phase === 'confirmed' && order.estimatedDelivery ? (
          <p className="mt-2 font-medium">
            {t('eta', {
              from: formatShortDate(order.estimatedDelivery.earliest),
              to: formatShortDate(order.estimatedDelivery.latest),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
