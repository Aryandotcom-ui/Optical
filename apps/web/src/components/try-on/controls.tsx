'use client';

import { brand } from '@optical/config/brand';
import type { ProductDetail } from '@optical/shared/catalog';
import { Camera, CameraOff, Columns2, Download, FlipHorizontal2 } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState, type KeyboardEvent } from 'react';
import { ProductImage } from '@/components/product/product-image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useTryOn } from '@/stores/try-on';
import { PhotoPicker } from './consent';

/** Frames to try, as a radio group: arrow keys move through it and choose. */
export function FrameCarousel({
  slugs,
  frames,
}: {
  slugs: readonly string[];
  frames: Map<string, ProductDetail>;
}) {
  const t = useTranslations('tryOn');
  const active = useTryOn((state) => state.active);
  const colours = useTryOn((state) => state.colours);
  const select = useTryOn((state) => state.select);
  const list = useRef<HTMLDivElement>(null);
  const ready = slugs.filter((slug) => frames.has(slug));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = ready.indexOf(active ?? '');
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step || ready.length === 0) return;
    event.preventDefault();
    const next = ready[(index + step + ready.length) % ready.length];
    if (!next) return;
    select(next);
    list.current?.querySelector<HTMLElement>(`[data-slug="${next}"]`)?.focus();
  };

  return (
    <div>
      <p id="try-on-frames" className="text-caption font-medium">
        {t('frames')}
      </p>
      <p id="try-on-frames-hint" className="sr-only">
        {t('framesHint')}
      </p>
      <div
        ref={list}
        role="radiogroup"
        tabIndex={-1}
        aria-labelledby="try-on-frames"
        aria-describedby="try-on-frames-hint"
        onKeyDown={onKeyDown}
        className="-mx-1 mt-2 flex snap-x gap-2 overflow-x-auto px-1 pb-2"
      >
        {ready.map((slug) => {
          const product = frames.get(slug);
          if (!product) return null;
          const variant =
            product.variants.find((entry) => entry.id === colours[slug]) ?? product.variants[0];
          const image =
            variant?.images.find((entry) => entry.kind === 'front') ?? variant?.images[0];
          const checked = slug === active;
          return (
            <button
              key={slug}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (!active && slug === ready[0]) ? 0 : -1}
              data-slug={slug}
              onClick={() => {
                select(slug);
              }}
              className={cn(
                'flex w-28 shrink-0 snap-start flex-col items-center gap-1 rounded-card p-2 text-caption ring-inset',
                checked ? 'ring-2 ring-ink' : 'ring-1 ring-hairline hover:ring-ink-secondary',
              )}
            >
              <span className="relative block aspect-[4/3] w-full">
                {image ? (
                  <ProductImage
                    src={image.url}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-contain"
                  />
                ) : null}
              </span>
              <span className="w-full truncate font-medium">{product.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Colour chips for the frame being worn; changing colour is instant. */
export function ColourChips({ product }: { product: ProductDetail }) {
  const t = useTranslations('tryOn');
  const chosen = useTryOn((state) => state.colours[product.slug]);
  const setColour = useTryOn((state) => state.setColour);
  const current = product.variants.find((entry) => entry.id === chosen) ?? product.variants[0];
  return (
    <fieldset>
      <legend className="text-caption font-medium">
        {t('colours')}:{' '}
        <span className="font-normal text-ink-secondary">{current?.colourName}</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {product.variants.map((variant) => (
          <label
            key={variant.id}
            className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-pill has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name={`try-on-colour-${product.slug}`}
              className="sr-only"
              checked={variant.id === current?.id}
              onChange={() => {
                setColour(product.slug, variant.id);
              }}
            />
            <span className="sr-only">{t('colourNamed', { colour: variant.colourName })}</span>
            <span
              aria-hidden="true"
              className={cn(
                'size-8 rounded-pill ring-1 ring-hairline',
                variant.id === current?.id &&
                  'ring-2 ring-ink ring-offset-2 ring-offset-background',
              )}
              style={{ backgroundColor: variant.swatchHex }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Compare, photo, mirror and camera switches. */
export function ActionBar({
  live,
  comparing,
  compareName,
  onCompare,
  onSnapshot,
  onPhoto,
  onCamera,
  onStop,
}: {
  live: boolean;
  comparing: boolean;
  compareName: string | null;
  onCompare: () => void;
  onSnapshot: () => Promise<boolean>;
  onPhoto: (file: File) => void;
  onCamera: () => void;
  onStop: () => void;
}) {
  const t = useTranslations('tryOn');
  const mirror = useTryOn((state) => state.mirror);
  const watermark = useTryOn((state) => state.watermark);
  const toggleMirror = useTryOn((state) => state.toggleMirror);
  const toggleWatermark = useTryOn((state) => state.toggleWatermark);
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        aria-pressed={comparing}
        disabled={!comparing && !compareName}
        onClick={onCompare}
      >
        <Columns2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {comparing
          ? t('compareOff')
          : compareName
            ? t('compareWith', { name: compareName })
            : t('compare')}
      </Button>
      <Button
        variant="secondary"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void onSnapshot()
            .then((saved) => notify(saved ? t('snapshotSaved') : t('snapshotFailed')))
            .finally(() => {
              setSaving(false);
            });
        }}
      >
        <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('snapshot')}
      </Button>
      {live ? (
        <Button variant="secondary" aria-pressed={mirror} onClick={toggleMirror}>
          <FlipHorizontal2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('mirror')}
        </Button>
      ) : null}
      {live ? (
        <>
          <PhotoPicker onPhoto={onPhoto} variant="ghost" label={t('usePhoto')} />
          <Button variant="ghost" onClick={onStop}>
            <CameraOff aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('stopCamera')}
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={onCamera}>
            <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('useCamera')}
          </Button>
          <PhotoPicker onPhoto={onPhoto} variant="ghost" label={t('usePhoto')} />
        </>
      )}
      <label className="flex min-h-11 items-center gap-2 text-caption">
        <input
          type="checkbox"
          checked={watermark}
          onChange={toggleWatermark}
          className="size-4 accent-[var(--color-accent)]"
        />
        {t('watermark', { brand: brand.shortName })}
      </label>
    </div>
  );
}

/** Buy or read more without losing the try-on session. */
export function PurchaseBar({
  product,
  onNavigate,
}: {
  product: ProductDetail;
  onNavigate?: (() => void) | undefined;
}) {
  const t = useTranslations('tryOn');
  const chosen = useTryOn((state) => state.colours[product.slug]);
  const variant = product.variants.find((entry) => entry.id === chosen) ?? product.variants[0];
  const [adding, setAdding] = useState(false);
  if (!variant) return null;
  const add = async () => {
    setAdding(true);
    try {
      const { addToCart } = await import('@/lib/bag-api');
      await addToCart({ variantId: variant.id });
      void notify(t('added', { name: product.name, colour: variant.colourName }));
    } catch (error) {
      void notify(error instanceof Error ? error.message : t('addFailed'));
    } finally {
      setAdding(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={adding || variant.stockState === 'out-of-stock'} onClick={() => void add()}>
        {adding ? t('adding') : t('addToBag', { price: formatPrice(variant.priceMinor) })}
      </Button>
      <Button asChild variant="secondary">
        <Link href={`/p/${product.slug}?colour=${variant.id}` as Route} onClick={onNavigate}>
          {t('details')}
        </Link>
      </Button>
    </div>
  );
}
