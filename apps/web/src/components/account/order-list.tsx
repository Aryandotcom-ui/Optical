'use client';

import type { OrderSummary } from '@optical/shared/account';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ProductImage } from '@/components/product/product-image';
import { formatPrice } from '@/lib/format';

/** Order rows: picture, number, date, status and total; each opens the order page. */
export function OrderRows({ orders }: { orders: OrderSummary[] }) {
  const t = useTranslations('account.orders');
  const format = useFormatter();
  return (
    <ul className="divide-y divide-hairline border-y border-hairline">
      {orders.map((order) => (
        <li key={order.number}>
          <Link
            href={`/order/${order.number}` as Route}
            aria-label={t('view', { number: order.number })}
            className="flex items-center gap-4 py-4 transition-colors hover:bg-surface-muted/60"
          >
            <div className="relative aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-media bg-surface-muted">
              {order.imageUrl ? (
                <ProductImage
                  src={order.imageUrl}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-contain p-[6%]"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{order.itemNames.join(', ')}</p>
              <p className="text-caption text-ink-secondary">
                {order.number} ·{' '}
                {t('placed', {
                  date: format.dateTime(new Date(order.placedAt), { dateStyle: 'medium' }),
                })}{' '}
                · {t('items', { count: order.itemCount })}
              </p>
              <p className="mt-1 text-caption font-medium">{order.statusLabel}</p>
            </div>
            <p className="tabular shrink-0 font-medium">{formatPrice(order.totalMinor)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
