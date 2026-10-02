'use client';

import { commerce } from '@optical/config/commerce';
import { Check, Info, RotateCcw, ShieldCheck } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CompareButton } from '@/components/product/compare-button';
import { WishlistButton } from '@/components/product/wishlist-button';
import { RatingStars } from '@/components/ui/rating';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { DeliveryEstimate } from './delivery-estimate';
import { useColourSelection, useProductView } from './product-view-context';

function StockLine() {
  const t = useTranslations('pdp.stock');
  const { variant, product } = useProductView();
  const othersInStock = product.variants.some(
    (entry) => entry.id !== variant.id && entry.stockState !== 'out-of-stock',
  );
  if (variant.stockState === 'in-stock') {
    return (
      <p className="flex items-center gap-2 text-success-ink">
        <Check aria-hidden="true" className="size-4" strokeWidth={2} />
        {t('inStock')}
      </p>
    );
  }
  if (variant.stockState === 'low-stock')
    return <p className="text-warning-ink">{t('low', { count: variant.lowStockCount ?? 0 })}</p>;
  return <p className="text-ink-secondary">{othersInStock ? t('outOtherColours') : t('out')}</p>;
}

/** The colour choice. It reads only the selection, so a click repaints just the swatches. */
function ColourSwatches() {
  const t = useTranslations('pdp');
  const { product } = useProductView();
  const { selectedId, selectVariant } = useColourSelection();
  const selected = product.variants.find((option) => option.id === selectedId);
  return (
    <fieldset>
      <legend className="font-medium">
        {t('colour')} <span className="font-normal text-ink-secondary">{selected?.colourName}</span>
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {product.variants.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === selectedId}
            aria-label={
              option.stockState === 'out-of-stock'
                ? t('colourOut', { colour: option.colourName })
                : option.colourName
            }
            title={option.colourName}
            onClick={() => {
              selectVariant(option.id);
            }}
            className={cn(
              'duration-micro relative flex size-11 items-center justify-center rounded-pill transition-shadow ease-standard ring-inset',
              option.id === selectedId
                ? 'ring-2 ring-ink'
                : 'ring-1 ring-hairline hover:ring-ink-secondary',
            )}
          >
            <span
              className="size-7 rounded-pill ring-1 ring-black/10"
              style={{ backgroundColor: option.swatchHex }}
            />
            {option.stockState === 'out-of-stock' ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-1.5 top-1/2 h-px -rotate-45 bg-ink-secondary"
              />
            ) : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Name, price, colour choice, stock, saving and delivery: the right-hand column. */
export function ProductPurchase({ categoryName }: { categoryName: string }) {
  const t = useTranslations('pdp');
  const tFits = useTranslations('product.fits');
  const { product, variant } = useProductView();
  const frame = product.frame;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/shop/${product.category}` as Route}
          className="text-caption font-medium tracking-wide text-ink-secondary uppercase hover:text-accent"
        >
          {categoryName}
        </Link>
        <h1 className="mt-1 text-display-md font-semibold tracking-tight">{product.name}</h1>
        {product.rating.average !== null ? (
          <a
            href="#reviews"
            className="mt-2 inline-flex items-center gap-2 text-caption text-ink-secondary hover:text-ink"
          >
            <RatingStars
              value={product.rating.average}
              label={t('ratingLabel', {
                rating: product.rating.average,
                count: product.rating.count,
              })}
            />
            <span aria-hidden="true">
              {product.rating.average.toFixed(1)} ·{' '}
              {t('reviewCount', { count: product.rating.count })}
            </span>
          </a>
        ) : null}
      </div>

      <div>
        <p className="tabular text-headline font-semibold">{formatPrice(variant.priceMinor)}</p>
        <p className="text-caption text-ink-secondary">
          {product.lensesAvailable
            ? t('priceNoteFrame', { tax: commerce.tax.name })
            : t('priceNote', { tax: commerce.tax.name })}
        </p>
      </div>

      <ColourSwatches />

      <div className="space-y-1 text-caption">
        <StockLine />
        {frame && product.size ? (
          <p className="text-ink-secondary">
            {tFits(product.size)} ·{' '}
            <span className="tabular">{`${frame.lensWidthMm}-${frame.bridgeMm}-${frame.templeMm}`}</span>{' '}
            ·{' '}
            <a href="#fit" className="font-medium text-accent hover:underline">
              {t('checkFit')}
            </a>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <WishlistButton
          id={product.id}
          slug={product.slug}
          name={product.name}
          withLabel
          className="flex-1 sm:flex-none"
        />
        {frame ? (
          <CompareButton
            id={product.id}
            slug={product.slug}
            name={product.name}
            className="flex-1 sm:flex-none"
          />
        ) : null}
      </div>
      <p className="flex gap-2 text-caption text-ink-secondary">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t('orderingSoon')}
      </p>

      <DeliveryEstimate />

      <ul className="grid gap-2 text-caption text-ink-secondary sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          <Link href={'/help/returns'} className="hover:text-ink hover:underline">
            {t('returns', { days: commerce.policies.returnWindowDays })}
          </Link>
        </li>
        <li className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('warranty', { months: commerce.policies.frameWarrantyMonths })}
        </li>
      </ul>
    </div>
  );
}
