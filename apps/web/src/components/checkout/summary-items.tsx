'use client';

import type { CartItem } from '@optical/shared/checkout';
import { useTranslations } from 'next-intl';
import { ProductImage } from '@/components/product/product-image';
import { formatPrice } from '@/lib/format';

/** Compact list of what's being bought, for the checkout summary. */
export function SummaryItems({ items }: { items: CartItem[] }) {
  const t = useTranslations('checkout');
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          <div className="relative aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-media bg-surface">
            {item.imageUrl ? (
              <ProductImage
                src={item.imageUrl}
                alt=""
                fill
                sizes="64px"
                className="object-contain p-[6%]"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 text-caption">
            <p className="font-medium text-ink">
              {item.quantity > 1 ? `${item.quantity} × ` : ''}
              {item.productName}
            </p>
            <p className="text-ink-secondary">
              {[item.colourName, ...item.lensLines.map((line) => line.label)].join(' · ') ||
                t('frameOnly')}
            </p>
          </div>
          <p className="tabular text-caption">{formatPrice(item.unitPriceMinor * item.quantity)}</p>
        </li>
      ))}
    </ul>
  );
}
