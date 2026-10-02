'use client';

import { shippingZoneFor } from '@optical/config/commerce';
import { estimateDelivery } from '@optical/shared/pricing/delivery';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatPrice, formatShortDate } from '@/lib/format';

/**
 * Delivery dates for a checked PIN code. Loaded only once a PIN is known,
 * so the date rules stay out of the product page's first download.
 */
export function DeliveryWindows({ pin }: { pin: string }) {
  const t = useTranslations('pdp.delivery');
  // Worked out once per PIN, not on every render of the purchase panel.
  const { frameOnly, withLenses, zone } = useMemo(() => {
    const orderedAt = new Date();
    const estimate = (needsLensProduction: boolean) =>
      estimateDelivery({ orderedAt, speed: 'standard', postalCode: pin, needsLensProduction });
    return { frameOnly: estimate(false), withLenses: estimate(true), zone: shippingZoneFor(pin) };
  }, [pin]);
  return (
    <dl className="space-y-1.5">
      <div className="flex justify-between gap-4">
        <dt className="text-ink-secondary">{t('frameOnly')}</dt>
        <dd className="tabular font-medium">
          {t('window', {
            from: formatShortDate(frameOnly.earliest),
            to: formatShortDate(frameOnly.latest),
          })}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-ink-secondary">{t('withLenses')}</dt>
        <dd className="tabular font-medium">
          {t('window', {
            from: formatShortDate(withLenses.earliest),
            to: formatShortDate(withLenses.latest),
          })}
        </dd>
      </div>
      {zone.surchargeMinor > 0 ? (
        <p className="text-ink-secondary">
          {t('remote', { amount: formatPrice(zone.surchargeMinor) })}
        </p>
      ) : null}
    </dl>
  );
}
