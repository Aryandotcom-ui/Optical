import { commerce } from '@optical/config/commerce';
import { Ruler, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatPrice } from '@/lib/format';
import { getStoreSettings } from '@/lib/store-settings';

/** Store promises, read from the commerce settings, so they can't drift from checkout. */
export async function TrustStrip() {
  const [t, { market }] = await Promise.all([getTranslations('home.trust'), getStoreSettings()]);
  const { policies } = commerce;
  const items = [
    {
      icon: RotateCcw,
      title: t('returnsTitle', { days: policies.returnWindowDays }),
      body: t('returnsBody'),
      href: '/help/returns',
    },
    {
      icon: ShieldCheck,
      title: t('warrantyTitle', { months: policies.frameWarrantyMonths }),
      body: t('warrantyBody'),
      href: '/help/returns',
    },
    {
      icon: Truck,
      title: t('deliveryTitle', { amount: formatPrice(market.freeShippingThresholdMinor) }),
      body: t('deliveryBody', { fee: formatPrice(market.standardFeeMinor) }),
      href: '/legal/shipping',
    },
    { icon: Ruler, title: t('measureTitle'), body: t('measureBody'), href: '/help/size-guide' },
  ] as const;
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, title, body, href }) => (
        <li key={title} className="rounded-card bg-surface-muted p-6">
          <Icon aria-hidden="true" className="size-6" strokeWidth={1.5} />
          <h3 className="mt-4 font-medium">
            <Link href={href as Route} className="hover:text-accent">
              {title}
            </Link>
          </h3>
          <p className="mt-2 text-caption text-ink-secondary">{body}</p>
        </li>
      ))}
    </ul>
  );
}
