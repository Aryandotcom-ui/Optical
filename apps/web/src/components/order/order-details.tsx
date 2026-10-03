'use client';

import type { OrderView } from '@optical/shared/checkout';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ProductImage } from '@/components/product/product-image';
import { formatPrice } from '@/lib/format';

/** Items, totals and where it's going. */
export function OrderDetails({ order }: { order: OrderView }) {
  const t = useTranslations('order.details');
  const address = order.shippingAddress;
  const row = (label: string, value: string, strong = false) => (
    <div
      className={
        strong ? 'flex justify-between gap-4 pt-2 font-semibold' : 'flex justify-between gap-4'
      }
    >
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
  return (
    <section aria-labelledby="order-items" className="space-y-6">
      <h2 id="order-items" className="text-title font-semibold">
        {t('title', { number: order.number })}
      </h2>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-4 py-4">
            <div className="relative aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-media bg-surface-muted">
              {item.imageUrl ? (
                <ProductImage
                  src={item.imageUrl}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-contain p-[6%]"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 text-caption">
              <p className="text-body font-medium">
                <Link href={`/p/${item.productSlug}` as Route} className="hover:text-accent">
                  {item.quantity > 1 ? `${item.quantity} × ` : ''}
                  {item.productName}
                </Link>
              </p>
              <p className="text-ink-secondary">
                {[item.colourName, ...item.lensSummary].join(' · ')}
              </p>
              {item.prescription ? (
                <p className="text-ink-secondary">
                  {item.prescription.provided ? t('rxReceived') : t('rxNeeded')}
                </p>
              ) : null}
            </div>
            <p className="tabular text-caption">{formatPrice(item.totalMinor)}</p>
          </li>
        ))}
      </ul>
      <dl className="space-y-1.5 text-caption">
        {row(t('subtotal'), formatPrice(order.totals.subtotalMinor))}
        {order.totals.discountMinor > 0
          ? row(
              t('discount', { code: order.totals.couponCode ?? '' }),
              `−${formatPrice(order.totals.discountMinor)}`,
            )
          : null}
        {row(
          t(`delivery.${order.shippingSpeed}`),
          order.totals.shippingMinor ? formatPrice(order.totals.shippingMinor) : t('free'),
        )}
        {order.totals.codFeeMinor > 0
          ? row(t('codFee'), formatPrice(order.totals.codFeeMinor))
          : null}
        {row(t('total'), formatPrice(order.totals.totalMinor), true)}
      </dl>
      <p className="text-caption text-ink-secondary">
        {t('tax', { tax: order.totals.taxName, amount: formatPrice(order.totals.taxMinor) })}
      </p>
      <div className="grid gap-6 text-caption sm:grid-cols-2">
        <div>
          <h3 className="font-medium text-ink">{t('deliverTo')}</h3>
          <address className="mt-1 text-ink-secondary not-italic">
            {address.fullName}
            <br />
            {address.line1}
            {address.line2 ? (
              <>
                <br />
                {address.line2}
              </>
            ) : null}
            <br />
            {`${address.city}, ${address.region} ${address.postalCode}`}
            <br />
            {address.phone}
          </address>
        </div>
        <div>
          <h3 className="font-medium text-ink">{t('payment')}</h3>
          <p className="mt-1 text-ink-secondary">{t(`provider.${order.paymentProvider}`)}</p>
          {order.shipment ? (
            <>
              <h3 className="mt-4 font-medium text-ink">{t('shipment')}</h3>
              <p className="mt-1 text-ink-secondary">{`${order.shipment.carrier} ${order.shipment.trackingNumber}`}</p>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
