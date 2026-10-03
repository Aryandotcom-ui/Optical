'use client';

import type { ProductDetail } from '@optical/shared/catalog';
import { FACE_SHAPE_MATCH } from '@optical/shared/catalog/lite';
import { GitCompareArrows, X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProductImage } from '@/components/product/product-image';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchProduct } from '@/lib/browser-api';
import { cn } from '@/lib/cn';
import { formatMm, formatPrice } from '@/lib/format';
import { useGrowingSet, useRemote } from '@/lib/use-remote';
import { COMPARE_LIMIT, useSavedLists, useSavedListsHydrated } from '@/stores/saved-lists';

/** A comma-separated list, or a dash when there's nothing to list. */
const listOrDash = (values: string[]) => (values.length > 0 ? values.join(', ') : '—');

interface Row {
  key: string;
  label: string;
  value: (product: ProductDetail) => string;
}

/** Side-by-side comparison of up to four frames, with differing rows marked. */
export function CompareView() {
  const t = useTranslations('comparePage');
  const tf = useTranslations('pdp.fit');
  const tShape = useTranslations('filters.shapeValues');
  const tMaterial = useTranslations('filters.materialValues');
  const tFeature = useTranslations('filters.featureValues');
  const tFace = useTranslations('filters.faceShapeValues');
  const tFits = useTranslations('product.fits');
  const hydrated = useSavedListsHydrated();
  const items = useSavedLists((state) => state.compare);
  const remove = useSavedLists((state) => state.removeFromCompare);
  const clear = useSavedLists((state) => state.clearCompare);
  const [onlyDifferences, setOnlyDifferences] = useState(false);

  const slugs = items.map((item) => item.slug);
  const toFetch = useGrowingSet(slugs, hydrated);
  const remote = useRemote(toFetch?.length ? `compare:${toFetch.join(',')}` : null, (signal) =>
    Promise.all((toFetch ?? []).map((slug) => fetchProduct(slug, signal))),
  );

  if (
    !hydrated ||
    (slugs.length > 0 && (remote.status === 'loading' || remote.status === 'idle'))
  ) {
    return <Skeleton className="h-96 w-full rounded-card" />;
  }

  if (remote.status === 'error') return <p className="text-danger-ink">{t('error')}</p>;

  const fetched =
    remote.status === 'success' ? remote.data.filter((product) => product !== null) : [];
  const products = slugs.flatMap((slug) => fetched.find((product) => product.slug === slug) ?? []);
  if (products.length === 0) {
    return (
      <div className="rounded-media bg-surface-muted px-6 py-16 text-center">
        <GitCompareArrows
          aria-hidden="true"
          className="mx-auto size-8 text-ink-secondary"
          strokeWidth={1.5}
        />
        <h2 className="mt-4 text-headline font-semibold">{t('emptyTitle')}</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-secondary">
          {t('emptyBody', { limit: COMPARE_LIMIT })}
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/shop">{t('browse')}</Link>
        </Button>
      </div>
    );
  }

  const mm =
    (pick: (frame: NonNullable<ProductDetail['frame']>) => number) => (product: ProductDetail) =>
      product.frame ? formatMm(pick(product.frame)) : '—';
  const rows: Row[] = [
    { key: 'price', label: t('price'), value: (product) => formatPrice(product.priceMinor) },
    {
      key: 'rating',
      label: t('rating'),
      value: (product) =>
        product.rating.average === null
          ? t('noRating')
          : t('ratingValue', {
              rating: product.rating.average.toFixed(1),
              count: product.rating.count,
            }),
    },
    {
      key: 'shape',
      label: tf('shape'),
      value: (product) => (product.shape ? tShape(product.shape) : '—'),
    },
    {
      key: 'material',
      label: tf('material'),
      value: (product) => (product.material ? tMaterial(product.material) : '—'),
    },
    {
      key: 'size',
      label: t('size'),
      value: (product) => (product.size ? tFits(product.size) : '—'),
    },
    { key: 'lens', label: tf('lensWidth'), value: mm((frame) => frame.lensWidthMm) },
    { key: 'bridge', label: tf('bridge'), value: mm((frame) => frame.bridgeMm) },
    { key: 'temple', label: tf('temple'), value: mm((frame) => frame.templeMm) },
    { key: 'height', label: tf('lensHeight'), value: mm((frame) => frame.lensHeightMm) },
    { key: 'width', label: tf('totalWidth'), value: mm((frame) => frame.totalWidthMm) },
    {
      key: 'weight',
      label: tf('weight'),
      value: (product) => (product.frame ? tf('grams', { value: product.frame.weightG }) : '—'),
    },
    {
      key: 'rim',
      label: tf('rim'),
      value: (product) => (product.frame ? tf(`rimValues.${product.frame.rimType}`) : '—'),
    },
    {
      key: 'hinge',
      label: tf('hinge'),
      value: (product) => (product.frame ? tf(`hingeValues.${product.frame.hinge}`) : '—'),
    },
    {
      key: 'features',
      label: t('features'),
      value: (product) =>
        listOrDash(product.frame?.features.map((feature) => tFeature(feature)) ?? []),
    },
    {
      key: 'faces',
      label: t('suits'),
      value: (product) =>
        listOrDash(
          product.faceShapes
            .filter((entry) => entry.score >= FACE_SHAPE_MATCH)
            .map((entry) => tFace(entry.faceShape)),
        ),
    },
    {
      key: 'colours',
      label: t('colours'),
      value: (product) => product.variants.map((variant) => variant.colourName).join(', '),
    },
  ];
  const differs = (row: Row) => new Set(products.map(row.value)).size > 1;
  const visibleRows = onlyDifferences && products.length > 1 ? rows.filter(differs) : rows;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={onlyDifferences}
            onChange={(event) => {
              setOnlyDifferences(event.target.checked);
            }}
            className="size-5 accent-[var(--color-accent)]"
          />
          {t('onlyDifferences')}
        </label>
        <Button variant="secondary" onClick={clear}>
          {t('clear')}
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
          <caption className="sr-only">{t('caption')}</caption>
          <thead>
            <tr>
              <td className="w-40" />
              {products.map((product) => {
                const image = product.variants[0]?.images.find((entry) => entry.kind === 'front');
                return (
                  <th key={product.id} scope="col" className="px-3 pb-6 align-top font-normal">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-media bg-surface-muted">
                      {image ? (
                        <ProductImage
                          src={image.url}
                          alt=""
                          fill
                          sizes="240px"
                          className="object-contain p-[6%]"
                        />
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-2">
                      <Link
                        href={`/p/${product.slug}` as Route}
                        className="font-medium hover:text-accent"
                      >
                        {product.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          remove(product.id);
                        }}
                        aria-label={t('remove', { name: product.name })}
                        className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-secondary hover:bg-surface-muted hover:text-ink"
                      >
                        <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const different = products.length > 1 && differs(row);
              return (
                <tr key={row.key} className="border-t border-hairline">
                  <th
                    scope="row"
                    className="py-3 pr-3 align-top text-caption font-medium text-ink-secondary"
                  >
                    <span className="inline-flex items-center gap-2">
                      {different ? (
                        <span aria-hidden="true" className="size-1.5 rounded-pill bg-accent" />
                      ) : null}
                      {row.label}
                      {different ? <span className="sr-only">{t('differs')}</span> : null}
                    </span>
                  </th>
                  {products.map((product) => (
                    <td
                      key={product.id}
                      className={cn('tabular px-3 py-3 align-top', different && 'font-medium')}
                    >
                      {row.value(product)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {products.length < COMPARE_LIMIT ? (
        <p className="mt-6 text-caption text-ink-secondary">
          {t('addMore', { count: COMPARE_LIMIT - products.length })}{' '}
          <Link href="/shop" className="font-medium text-accent hover:underline">
            {t('browse')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
