'use client';

import type { ListingFacets, ListingQuery } from '@optical/shared/catalog';
import { listingSorts } from '@optical/shared/catalog/lite';
import { SlidersHorizontal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LazySheet } from '@/components/ui/lazy-sheet';
import { FilterPanel } from './filter-panel';
import { useListing } from './listing-context';

export interface ActiveChip {
  key: string;
  value: string;
  label: string;
}

function withoutChip(query: ListingQuery, chip: ActiveChip): Partial<ListingQuery> {
  const current = query[chip.key as keyof ListingQuery];
  if (Array.isArray(current))
    return { [chip.key]: current.filter((value) => value !== chip.value) };
  return { [chip.key]: undefined };
}

/** Sort control, the mobile filter sheet and removable active-filter chips. */
export function ListingToolbar({
  facets,
  total,
  chips,
  showCategory,
  showCollection,
}: {
  facets: ListingFacets;
  total: number;
  chips: ActiveChip[];
  showCategory: boolean;
  showCollection: boolean;
}) {
  const t = useTranslations('listing');
  const { query, update } = useListing();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const clearAll = () => {
    const patch: Partial<ListingQuery> = {};
    for (const chip of chips)
      Object.assign(patch, {
        [chip.key]: Array.isArray(query[chip.key as keyof ListingQuery]) ? [] : undefined,
      });
    update(patch, true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          ref={filtersButton}
          variant="secondary"
          className="lg:hidden"
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          onClick={() => {
            setFiltersOpen(true);
          }}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {chips.length ? t('filtersWithCount', { count: chips.length }) : t('filters')}
        </Button>
        <LazySheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          returnFocusTo={filtersButton}
          side="bottom"
          title={t('filters')}
          closeLabel={t('closeFilters')}
          footer={
            <div className="flex gap-3">
              {chips.length ? (
                <Button variant="secondary" size="lg" onClick={clearAll}>
                  {t('clearAll')}
                </Button>
              ) : null}
              <Button
                size="lg"
                className="flex-1"
                onClick={() => {
                  setFiltersOpen(false);
                }}
              >
                {t('showResults', { count: total })}
              </Button>
            </div>
          }
        >
          <FilterPanel
            facets={facets}
            showCategory={showCategory}
            showCollection={showCollection}
          />
        </LazySheet>

        <label className="ml-auto flex min-w-0 items-center gap-2 text-ink-secondary">
          <span className="sr-only sm:not-sr-only">{t('sortBy')}</span>
          <select
            value={query.sort}
            onChange={(event) => {
              update({ sort: event.target.value as ListingQuery['sort'] }, true);
            }}
            className="min-h-11 max-w-full min-w-0 rounded-pill bg-surface px-4 pr-8 text-ink ring-1 ring-hairline ring-inset focus:ring-2 focus:ring-accent"
          >
            {listingSorts.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sort.${sort}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {chips.length ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label={t('activeFilters')}>
          {chips.map((chip) => (
            <li key={`${chip.key}-${chip.value}`}>
              <button
                type="button"
                onClick={() => {
                  update(withoutChip(query, chip), true);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-surface-muted py-1 pr-2 pl-3 text-caption font-medium hover:bg-hairline"
                aria-label={t('removeFilter', { label: chip.label })}
              >
                {chip.label}
                <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={clearAll}
              className="min-h-9 px-2 text-caption font-medium text-accent hover:underline"
            >
              {t('clearAll')}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** One-tap recovery from an empty result: removes the filter that brings back the most frames. */
export function RemoveFilterButton({ chip, count }: { chip: ActiveChip; count: number }) {
  const t = useTranslations('listing');
  const { query, update } = useListing();
  return (
    <Button
      size="lg"
      wrap
      onClick={() => {
        update(withoutChip(query, chip), true);
      }}
    >
      {t('removeToSee', { label: chip.label, count })}
    </Button>
  );
}
