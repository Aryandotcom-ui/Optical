import {
  toListingQueryString,
  type ListingQuery,
  type ProductListing,
} from '@optical/shared/catalog';
import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { getListing } from '@/lib/catalog';
import { formatPrice } from '@/lib/format';
import { activeFilters, parseListingParams, type SearchParamsRecord } from '@/lib/listing-params';
import { omitKeys } from '@/lib/objects';
import { FilterPanel } from './filter-panel';
import { ListingProvider, PendingResults } from './listing-context';
import { ListingToolbar, RemoveFilterButton, type ActiveChip } from './listing-toolbar';

/** "Load more" renders pages 1..N, so cap N to keep each request bounded. */
const MAX_PAGES_RENDERED = 8;

export interface ListingViewProps {
  searchParams: Promise<SearchParamsRecord>;
  /** Filters implied by the page itself (category page, collection page, search). */
  fixed?: Partial<ListingQuery>;
  title: string;
  description?: string;
  eyebrow?: string;
  basePath: string;
  showCategory?: boolean;
  showCollection?: boolean;
  /** Extra content above the results, e.g. a collection introduction. */
  intro?: ReactNode;
}

function without(query: ListingQuery, chip: ActiveChip): ListingQuery {
  const current = query[chip.key as keyof ListingQuery];
  return {
    ...query,
    page: 1,
    pageSize: 1,
    [chip.key]: Array.isArray(current)
      ? current.filter((value) => value !== chip.value)
      : undefined,
  };
}

export async function ListingView({
  searchParams,
  fixed = {},
  title,
  description,
  eyebrow,
  basePath,
  showCategory = false,
  showCollection = false,
  intro,
}: ListingViewProps) {
  const t = await getTranslations('listing');
  const tf = await getTranslations('filters');
  const { query } = parseListingParams(await searchParams, fixed);
  const pageCount = Math.min(query.page, MAX_PAGES_RENDERED);
  const pages: ProductListing[] = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => getListing({ ...query, page: index + 1 })),
  );
  const last = pages.at(-1);
  if (!last) throw new Error('No listing pages loaded.');
  const items = pages.flatMap((page) => page.items);
  const { facets, total } = last;

  const chips: ActiveChip[] = activeFilters(query, fixed).map(({ key, value }) => {
    const label = (() => {
      switch (key) {
        case 'minPrice':
          return t('priceFrom', { amount: formatPrice(Number(value)) });
        case 'maxPrice':
          return t('priceUpTo', { amount: formatPrice(Number(value)) });
        case 'minRating':
          return tf(`ratingValues.${value}` as 'ratingValues.4');
        case 'inStock':
          return tf('inStock');
        case 'collection':
          return facets.collection.find((option) => option.value === value)?.label ?? value;
        case 'category':
          return tf(`categoryValues.${value}` as 'categoryValues.eyeglasses');
        case 'q':
          return value;
        default:
          return tf(`${key}Values.${value}` as 'shapeValues.round');
      }
    })();
    return { key, value, label };
  });

  // Empty state: find the single filter whose removal brings back the most frames.
  let suggestion: { chip: ActiveChip; count: number } | null = null;
  if (total === 0 && chips.length > 0) {
    const counts = await Promise.all(
      chips.map(async (chip) => ({ chip, count: (await getListing(without(query, chip))).total })),
    );
    suggestion = counts.reduce<{ chip: ActiveChip; count: number } | null>(
      (best, entry) => (entry.count > (best?.count ?? 0) ? entry : best),
      null,
    );
  }

  const nextParams = toListingQueryString(
    omitKeys({ ...query, page: query.page + 1 }, Object.keys(fixed)),
  );
  const hasMore = items.length < total && query.page < MAX_PAGES_RENDERED;

  return (
    <ListingProvider query={query} fixed={fixed}>
      <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
        <header className="max-w-3xl">
          {eyebrow ? (
            <p className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 text-display-md font-semibold text-balance">{title}</h1>
          {description ? (
            <p className="mt-3 text-body-lg text-pretty text-ink-secondary">{description}</p>
          ) : null}
        </header>
        {intro}

        <div className="mt-10 grid gap-10 lg:grid-cols-[17rem_1fr]">
          <aside className="hidden lg:block" aria-label={t('filters')}>
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2 pb-6">
              <FilterPanel
                facets={facets}
                showCategory={showCategory}
                showCollection={showCollection}
              />
            </div>
          </aside>

          <section aria-labelledby="results-heading">
            <h2 id="results-heading" className="sr-only">
              {t('results')}
            </h2>
            <ListingToolbar
              facets={facets}
              total={total}
              chips={chips}
              showCategory={showCategory}
              showCollection={showCollection}
            />
            <p className="mt-4 text-caption text-ink-secondary" aria-live="polite">
              {total > 0 ? t('showing', { shown: items.length, total }) : t('emptyTitle')}
            </p>

            <PendingResults>
              {items.length > 0 ? (
                <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
                  {items.map((product, index) => (
                    <li key={product.id}>
                      <ProductCard product={product} priority={index < 4} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 rounded-media bg-surface-muted px-5 py-12 text-center sm:px-6 sm:py-16">
                  <h3 className="text-title font-semibold">{t('emptyTitle')}</h3>
                  <p className="mx-auto mt-2 max-w-md text-ink-secondary">
                    {suggestion
                      ? t('emptyWithSuggestion')
                      : chips.length
                        ? t('emptyFiltered')
                        : t('emptyNone')}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    {suggestion ? (
                      <RemoveFilterButton chip={suggestion.chip} count={suggestion.count} />
                    ) : null}
                    <Button asChild size="lg" variant="secondary">
                      <Link href="/shop">{t('browseAll')}</Link>
                    </Button>
                  </div>
                </div>
              )}

              {hasMore ? (
                <div className="mt-12 flex flex-col items-center gap-3">
                  <p className="text-caption text-ink-secondary">
                    {t('showing', { shown: items.length, total })}
                  </p>
                  <Button asChild size="lg" variant="secondary">
                    <Link
                      href={`${basePath}?${nextParams}` as Route}
                      scroll={false}
                      prefetch={false}
                    >
                      {t('loadMore')}
                    </Link>
                  </Button>
                </div>
              ) : null}
            </PendingResults>
          </section>
        </div>
      </div>
    </ListingProvider>
  );
}
