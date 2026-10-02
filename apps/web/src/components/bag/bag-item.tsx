'use client';

import type { CartItem } from '@optical/shared/checkout';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { ProductImage } from '@/components/product/product-image';
import { formatPrice } from '@/lib/format';

/** One line in the bag: what it is, the lens choices, quantity and price. */
export function BagItem({
  item,
  busy,
  onQuantity,
  onRemove,
}: {
  item: CartItem;
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('bag.item');
  const id = useId();
  const lens = item.lensLines.map((line) => line.label);
  const rx = item.lensConfig?.prescription?.mode;
  const options = Array.from(
    { length: Math.max(item.quantity, item.maxQuantity) },
    (_, index) => index + 1,
  );
  return (
    <li className="flex gap-4 py-6">
      <Link
        href={`/p/${item.productSlug}` as Route}
        className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-media bg-surface-muted sm:w-36"
        tabIndex={-1}
        aria-hidden="true"
      >
        {item.imageUrl ? (
          <ProductImage
            src={item.imageUrl}
            alt=""
            fill
            sizes="144px"
            className="object-contain p-[6%]"
          />
        ) : null}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-medium">
            <Link href={`/p/${item.productSlug}` as Route} className="hover:text-accent">
              {item.productName}
            </Link>
          </h2>
          <p className="tabular font-medium">{formatPrice(item.unitPriceMinor * item.quantity)}</p>
        </div>
        <p className="text-caption text-ink-secondary">{item.colourName}</p>
        <p className="mt-1 text-caption text-ink-secondary">
          {lens.length > 0 ? lens.join(' · ') : t('frameOnly')}
        </p>
        {rx ? <p className="text-caption text-ink-secondary">{t(`rx.${rx}`)}</p> : null}
        {item.issue ? (
          <p role="status" className="mt-2 text-caption font-medium text-danger-ink">
            {t(`issue.${item.issue}`, { count: item.maxQuantity })}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor={`${id}-qty`} className="sr-only">
            {t('quantity', { name: item.productName })}
          </label>
          <select
            id={`${id}-qty`}
            value={item.quantity}
            disabled={busy || item.issue === 'unavailable' || item.issue === 'out-of-stock'}
            onChange={(event) => {
              onQuantity(Number(event.target.value));
            }}
            className="tabular min-h-11 rounded-pill bg-surface px-4 ring-1 ring-hairline ring-inset focus:ring-2 focus:ring-accent focus:outline-none"
          >
            {options.map((quantity) => (
              <option key={quantity} value={quantity}>
                {t('qtyOption', { quantity })}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="min-h-11 rounded-pill px-3 text-caption font-medium text-ink-secondary hover:text-ink hover:underline"
          >
            {t('remove')}
            <span className="sr-only">{`: ${item.productName}`}</span>
          </button>
          {item.quantity > 1 ? (
            <span className="tabular text-caption text-ink-secondary">
              {t('each', { price: formatPrice(item.unitPriceMinor) })}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
