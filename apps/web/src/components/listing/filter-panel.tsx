'use client';

import type { FacetOption, ListingFacets, ListingQuery } from '@optical/shared/catalog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Disclosure } from '@/components/ui/disclosure';
import { RangeSlider } from '@/components/ui/slider';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { useListing } from './listing-context';

type MultiKey =
  'shape' | 'material' | 'size' | 'colour' | 'fit' | 'feature' | 'faceShape' | 'collection';

const colourSwatch: Record<string, string> = {
  black: '#141416',
  tortoise: 'linear-gradient(135deg,#7a4520 0 40%,#2a160a 40% 60%,#7a4520 60%)',
  brown: '#5b3a22',
  grey: '#8a8d91',
  clear: 'linear-gradient(135deg,#ffffff,#dfe6ea)',
  blue: '#2a5aa8',
  green: '#4f7a4a',
  red: '#a3313b',
  pink: '#d8a0b0',
  beige: '#d6c3a5',
  gold: 'linear-gradient(135deg,#e8cf8f,#b48a3c)',
  silver: 'linear-gradient(135deg,#f0f1f3,#a9adb3)',
  gunmetal: '#4a4d52',
  'rose-gold': 'linear-gradient(135deg,#ecc3b2,#b98471)',
};

function toggle(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

/** Options to show: everything with results, plus anything already selected. */
function visible(options: FacetOption[], selected: readonly string[]) {
  const shown = options.filter((option) => option.count > 0 || selected.includes(option.value));
  for (const value of selected)
    if (!shown.some((option) => option.value === value)) shown.push({ value, count: 0 });
  return shown;
}

function MultiFacet({
  facet,
  options,
  label,
  swatches = false,
}: {
  facet: MultiKey;
  options: FacetOption[];
  label: (value: string, option: FacetOption) => string;
  swatches?: boolean;
}) {
  const { query, update } = useListing();
  const t = useTranslations('listing');
  const selected = query[facet] as readonly string[];
  return (
    <ul className={cn('flex flex-wrap gap-2', swatches && 'gap-y-3')}>
      {visible(options, selected).map((option) => {
        const pressed = selected.includes(option.value);
        return (
          <li key={option.value}>
            <Chip
              pressed={pressed}
              onClick={() => {
                update({ [facet]: toggle(selected, option.value) });
              }}
              aria-label={t('optionWithCount', {
                label: label(option.value, option),
                count: option.count,
              })}
            >
              {swatches ? (
                <span
                  aria-hidden="true"
                  className="size-4 rounded-pill ring-1 ring-black/10"
                  style={{ background: colourSwatch[option.value] ?? '#ccc' }}
                />
              ) : null}
              <span>{label(option.value, option)}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'tabular text-caption',
                  pressed ? 'opacity-70' : 'text-ink-secondary',
                )}
              >
                {option.count}
              </span>
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}

function PriceFacet({ range }: { range: ListingFacets['price'] }) {
  const { query, update } = useListing();
  const t = useTranslations('listing');
  const min = range.minMinor ?? 0;
  const max = range.maxMinor ?? 0;
  const step = 100_00;
  const floor = Math.floor(min / step) * step;
  const ceil = Math.ceil(max / step) * step;
  // The URL is the source of truth. A draft (while dragging, using arrow keys
  // or typing) stands until the URL changes, so quick successive edits build
  // on each other instead of snapping back while the navigation is pending.
  const fromUrl: [number, number] = [query.minPrice ?? floor, query.maxPrice ?? ceil];
  const urlKey = fromUrl.join('-');
  const [draft, setDraftState] = useState<{ value: [number, number]; urlKey: string } | null>(null);
  const value = draft?.urlKey === urlKey ? draft.value : fromUrl;
  const setDraft = (next: [number, number]) => {
    setDraftState({ value: next, urlKey });
  };

  if (range.minMinor === null || ceil <= floor)
    return <p className="text-ink-secondary">{t('noPriceRange')}</p>;

  const commit = ([low, high]: [number, number]) => {
    update({ minPrice: low > floor ? low : undefined, maxPrice: high < ceil ? high : undefined });
  };
  const inputClass =
    'tabular h-11 w-full rounded-control bg-surface px-3 ring-1 ring-hairline ring-inset focus:ring-2 focus:ring-accent';

  return (
    <div>
      <RangeSlider
        min={floor}
        max={ceil}
        step={step}
        value={value}
        onValueChange={setDraft}
        onValueCommit={commit}
        thumbLabels={[t('priceMin'), t('priceMax')]}
        formatValue={formatPrice}
      />
      <div className="mt-2 grid grid-cols-2 gap-3">
        {(['priceMin', 'priceMax'] as const).map((key, index) => (
          <label key={key} className="text-caption text-ink-secondary">
            {t(key)}
            <input
              className={cn(inputClass, 'mt-1 text-body text-ink')}
              inputMode="numeric"
              value={Math.round((value[index] ?? 0) / 100)}
              onChange={(event) => {
                const rupees = Number(event.target.value.replace(/[^\d]/g, ''));
                const next: [number, number] = [...value];
                next[index] = rupees * 100;
                setDraft(next);
              }}
              onBlur={() => {
                const low = Math.max(floor, Math.min(value[0], value[1]));
                const high = Math.min(ceil, Math.max(value[0], value[1]));
                commit([low, high]);
              }}
              aria-describedby="price-range-hint"
            />
          </label>
        ))}
      </div>
      <p id="price-range-hint" className="mt-2 text-caption text-ink-secondary">
        {t('priceRangeHint', { min: formatPrice(floor), max: formatPrice(ceil) })}
      </p>
    </div>
  );
}

/**
 * Every filter group, with live counts. Used in the desktop sidebar and in
 * the mobile filter sheet. Each change updates the URL (debounced).
 */
export function FilterPanel({
  facets,
  showCategory,
  showCollection,
}: {
  facets: ListingFacets;
  showCategory: boolean;
  showCollection: boolean;
}) {
  const t = useTranslations('filters');
  const { query, update } = useListing();
  const groups: { key: string; title: string; content: React.ReactNode; active: number }[] = [];

  if (showCategory && facets.category.length > 1) {
    groups.push({
      key: 'category',
      title: t('category'),
      active: query.category ? 1 : 0,
      content: (
        <ul className="flex flex-wrap gap-2">
          {facets.category.map((option) => (
            <li key={option.value}>
              <Chip
                pressed={query.category === option.value}
                onClick={() => {
                  update({
                    category:
                      query.category === option.value
                        ? undefined
                        : (option.value as ListingQuery['category']),
                  });
                }}
              >
                {t(`categoryValues.${option.value}` as 'categoryValues.eyeglasses')}
                <span className="tabular text-caption opacity-70">{option.count}</span>
              </Chip>
            </li>
          ))}
        </ul>
      ),
    });
  }

  const multi = (
    key: MultiKey,
    title: string,
    label: (value: string, option: FacetOption) => string,
    swatches = false,
  ) => {
    if (facets[key].length === 0 && query[key].length === 0) return;
    groups.push({
      key,
      title,
      active: query[key].length,
      content: <MultiFacet facet={key} options={facets[key]} label={label} swatches={swatches} />,
    });
  };

  multi('shape', t('shape'), (value) => t(`shapeValues.${value}` as 'shapeValues.round'));
  multi('colour', t('colour'), (value) => t(`colourValues.${value}` as 'colourValues.black'), true);
  multi(
    'size',
    t('size'),
    (value) =>
      `${t(`sizeValues.${value}` as 'sizeValues.small')} · ${t(`sizeHints.${value}` as 'sizeHints.small')}`,
  );
  multi('material', t('material'), (value) =>
    t(`materialValues.${value}` as 'materialValues.acetate'),
  );
  groups.push({
    key: 'price',
    title: t('price'),
    active: query.minPrice !== undefined || query.maxPrice !== undefined ? 1 : 0,
    content: <PriceFacet range={facets.price} />,
  });
  multi('fit', t('fit'), (value) => t(`fitValues.${value}` as 'fitValues.women'));
  multi('faceShape', t('faceShape'), (value) =>
    t(`faceShapeValues.${value}` as 'faceShapeValues.oval'),
  );
  multi('feature', t('feature'), (value) =>
    t(`featureValues.${value}` as 'featureValues.lightweight'),
  );
  if (showCollection)
    multi('collection', t('collection'), (value, option) => option.label ?? value);
  if (facets.rating.length > 0) {
    groups.push({
      key: 'rating',
      title: t('rating'),
      active: query.minRating ? 1 : 0,
      content: (
        <ul className="flex flex-wrap gap-2">
          {facets.rating.map((option) => (
            <li key={option.value}>
              <Chip
                pressed={String(query.minRating) === option.value}
                onClick={() => {
                  update({
                    minRating:
                      String(query.minRating) === option.value ? undefined : Number(option.value),
                  });
                }}
              >
                {t(`ratingValues.${option.value}` as 'ratingValues.4')}
                <span className="tabular text-caption opacity-70">{option.count}</span>
              </Chip>
            </li>
          ))}
        </ul>
      ),
    });
  }

  // Which groups start open is decided once; after that the visitor's own choices stand.
  const [initiallyOpen] = useState(
    () =>
      new Set(
        groups.filter((group, index) => index < 3 || group.active > 0).map((group) => group.key),
      ),
  );

  return (
    <div>
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 border-b border-hairline pb-2 font-medium">
        {t('inStock')}
        <input
          type="checkbox"
          role="switch"
          checked={query.inStock ?? false}
          onChange={(event) => {
            update({ inStock: event.target.checked || undefined });
          }}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="duration-micro after:duration-micro relative h-7 w-12 rounded-pill bg-hairline transition-colors peer-checked:bg-accent-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-pill after:bg-surface after:shadow-float after:transition-transform peer-checked:after:translate-x-5"
        />
      </label>
      {groups.map((group) => (
        <Disclosure
          key={group.key}
          defaultOpen={initiallyOpen.has(group.key)}
          summary={
            <span>
              {group.title}
              {group.active > 0 ? (
                <span className="tabular ml-2 rounded-pill bg-ink px-2 py-0.5 text-caption text-background">
                  {group.active}
                </span>
              ) : null}
            </span>
          }
        >
          {group.content}
        </Disclosure>
      ))}
    </div>
  );
}
