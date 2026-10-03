'use client';

import type { ProductSummary } from '@optical/shared/catalog';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RatingCompact } from '@/components/ui/rating';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { LinkPending } from './link-pending';
import { ProductImage } from './product-image';
import { TryOnButton } from '@/components/try-on/try-on-button';
import { WishlistButton } from './wishlist-button';

const MAX_SWATCHES = 4;

/**
 * Listing card: studio image that swaps to the three-quarter view on hover,
 * colour swatches that switch the image instantly, wishlist heart, price,
 * rating and an honest stock note.
 */
export function ProductCard({
  product,
  priority = false,
  sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw',
}: {
  product: ProductSummary;
  priority?: boolean;
  sizes?: string;
}) {
  const t = useTranslations('product');
  const [variantId, setVariantId] = useState(product.defaultVariantId);
  const variant = product.variants.find((entry) => entry.id === variantId) ?? product.variants[0];
  if (!variant) return null;
  const front = variant.images.find((image) => image.kind === 'front') ?? variant.images[0];
  const angle = variant.images.find((image) => image.kind === 'angle');
  const href =
    `/p/${product.slug}${variant.id === product.defaultVariantId ? '' : `?colour=${variant.id}`}` as Route;
  const extraSwatches = product.variants.length - MAX_SWATCHES;

  return (
    <article className="group relative flex flex-col">
      <Link
        href={href}
        className="relative block overflow-hidden rounded-media bg-surface-muted"
        aria-label={t('cardLabel', { name: product.name, colour: variant.colourName })}
      >
        <div className="relative aspect-[4/3]">
          {front ? (
            <ProductImage
              src={front.url}
              alt={front.alt}
              fill
              sizes={sizes}
              loading={priority ? 'eager' : 'lazy'}
              className={cn(
                'duration-ui object-contain p-[6%] transition-opacity ease-standard',
                angle && 'group-hover:opacity-0',
              )}
            />
          ) : null}
          {angle ? (
            <ProductImage
              src={angle.url}
              alt=""
              fill
              sizes={sizes}
              className="duration-ui object-contain p-[6%] opacity-0 transition-opacity ease-standard group-hover:opacity-100"
            />
          ) : null}
        </div>
        <LinkPending />
        {product.isNew ? (
          <span className="absolute top-3 left-3 rounded-pill bg-surface px-3 py-1 text-caption font-medium">
            {t('new')}
          </span>
        ) : null}
      </Link>
      <WishlistButton
        id={product.id}
        slug={product.slug}
        name={product.name}
        className="absolute top-2 right-2 z-10"
      />
      {product.shape ? (
        <TryOnButton
          slug={product.slug}
          name={product.name}
          variantId={variant.id}
          compact
          className="absolute top-14 right-2 z-10"
        />
      ) : null}

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">
            <Link
              href={href}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
              tabIndex={-1}
            >
              {product.name}
            </Link>
          </h3>
          <p className="text-caption text-ink-secondary">
            {product.size ? t(`fits.${product.size}`) : t(`category.${product.category}`)}
          </p>
        </div>
        <p className="tabular shrink-0 font-medium">{formatPrice(product.priceMinor)}</p>
      </div>

      <div className="relative z-10 mt-2 flex min-h-6 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <ul className="flex min-w-0 items-center gap-1" aria-label={t('colours')}>
          {product.variants.slice(0, MAX_SWATCHES).map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  setVariantId(option.id);
                }}
                aria-pressed={option.id === variant.id}
                aria-label={option.colourName}
                title={option.colourName}
                className={cn(
                  'duration-micro flex size-6 items-center justify-center rounded-pill ring-1 transition-shadow ease-standard',
                  option.id === variant.id ? 'ring-ink' : 'ring-transparent hover:ring-hairline',
                )}
              >
                <span
                  className="size-4 rounded-pill ring-1 ring-black/10"
                  style={{ backgroundColor: option.swatchHex }}
                />
              </button>
            </li>
          ))}
          {extraSwatches > 0 ? (
            <li className="text-caption text-ink-secondary">+{extraSwatches}</li>
          ) : null}
        </ul>
        {product.rating.average !== null ? (
          <RatingCompact
            value={product.rating.average}
            count={product.rating.count}
            label={t('ratingLabel', {
              rating: product.rating.average,
              count: product.rating.count,
            })}
          />
        ) : null}
      </div>
      {variant.stockState !== 'in-stock' ? (
        <p
          className={cn(
            'mt-1 text-caption',
            variant.stockState === 'out-of-stock' ? 'text-ink-secondary' : 'text-warning-ink',
          )}
        >
          {variant.stockState === 'out-of-stock'
            ? t('outOfStock')
            : t('lowStock', { count: variant.lowStockCount ?? 0 })}
        </p>
      ) : null}
    </article>
  );
}
