'use client';

import type { Pricing } from '@optical/shared/checkout';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatPrice } from '@/lib/format';

/** Subtotal, discount, delivery, fees, total and the tax inside it. Shared by the bag and checkout. */
export function OrderSummary({
  pricing,
  deliveryKnown,
  children,
}: {
  pricing: Pricing;
  /** False in the bag, where the address (and so any remote-area surcharge) isn't known yet. */
  deliveryKnown: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('bag.summary');
  const row = (label: ReactNode, value: string, strong = false) => (
    <div
      className={
        strong
          ? 'flex justify-between gap-4 pt-3 text-title font-semibold'
          : 'flex justify-between gap-4'
      }
    >
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
  const delivery =
    pricing.shipping.feeMinor === 0 ? t('free') : formatPrice(pricing.shipping.feeMinor);
  return (
    <div>
      <dl className="space-y-2">
        {row(t('subtotal'), formatPrice(pricing.subtotalMinor))}
        {pricing.discountMinor > 0
          ? row(
              t('discount', { code: pricing.coupon?.code ?? '' }),
              `−${formatPrice(pricing.discountMinor)}`,
            )
          : null}
        {row(deliveryKnown ? t(`delivery.${pricing.shipping.speed}`) : t('deliveryFrom'), delivery)}
        {pricing.codFee.feeMinor > 0
          ? row(t('codFee'), formatPrice(pricing.codFee.feeMinor))
          : null}
        <div className="border-t border-hairline" />
        {row(t('total'), formatPrice(pricing.totalMinor), true)}
      </dl>
      <p className="mt-1 text-caption text-ink-secondary">
        {t('tax', { tax: pricing.tax.name, amount: formatPrice(pricing.tax.totalMinor) })}
      </p>
      {pricing.shipping.remainingForFreeMinor > 0 ? (
        <p className="mt-3 text-caption text-ink-secondary">
          {t('freeShippingGap', { amount: formatPrice(pricing.shipping.remainingForFreeMinor) })}
        </p>
      ) : null}
      {children}
    </div>
  );
}
