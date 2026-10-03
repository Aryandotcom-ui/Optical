'use client';

import type { SearchSuggestions } from '@optical/shared/catalog';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { ArrowRight, Clock, Folder, HelpCircle, Layers, Search } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useEffect, useState } from 'react';
import { ProductImage } from '@/components/product/product-image';
import { fetchSuggestions } from '@/lib/browser-api';
import { formatPrice } from '@/lib/format';
import { createLocalValue } from '@/lib/local-value';
import { QueryProvider } from '@/components/providers/query-provider';

const RECENT_KEY = 'recent-searches';
const RECENT_LIMIT = 5;
const DEBOUNCE_MS = 150;

const recentSearches = createLocalValue<string[]>(
  RECENT_KEY,
  (raw) =>
    Array.isArray(raw)
      ? raw.filter((entry): entry is string => typeof entry === 'string').slice(0, RECENT_LIMIT)
      : null,
  [],
);

function saveRecent(query: string) {
  const next = [
    query,
    ...recentSearches.get().filter((entry) => entry.toLowerCase() !== query.toLowerCase()),
  ].slice(0, RECENT_LIMIT);
  recentSearches.set(next);
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

const itemClass =
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-3 text-body data-[selected=true]:bg-surface-muted';
const groupHeadingClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-4 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-secondary';

/**
 * Command-palette search: instant, typo-tolerant suggestions grouped by
 * products, categories, collections and help, with recent searches kept
 * only on this device. Arrow keys move, Enter opens, Escape closes.
 */
function SearchPaletteContent({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('search');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const recent = recentSearches.useValue();
  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, DEBOUNCE_MS);

  const { data, isFetching, isError } = useQuery<SearchSuggestions>({
    queryKey: ['suggest', debounced],
    queryFn: ({ signal }) => fetchSuggestions(debounced, signal),
    enabled: open && debounced.length > 0,
    placeholderData: (previous) => previous,
  });

  const go = (href: string, remember?: string) => {
    if (remember) saveRecent(remember);
    onOpenChange(false);
    setQuery('');
    router.push(href as Route);
  };
  const searchAll = (value: string) => {
    go(`/search?q=${encodeURIComponent(value)}`, value);
  };
  const results = debounced.length > 0 && data?.query === debounced ? data : null;
  const empty =
    results &&
    results.products.length +
      results.categories.length +
      results.collections.length +
      results.articles.length ===
      0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[8vh] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-card bg-surface shadow-overlay ring-1 ring-hairline data-[state=open]:animate-fade-in"
        >
          <Dialog.Title className="sr-only">{t('title')}</Dialog.Title>
          <Command shouldFilter={false} loop label={t('title')}>
            <div className="flex items-center gap-3 border-b border-hairline px-4">
              <Search
                aria-hidden="true"
                className="size-5 shrink-0 text-ink-secondary"
                strokeWidth={1.5}
              />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t('placeholder')}
                className="h-14 flex-1 bg-transparent text-body-lg outline-none placeholder:text-ink-secondary"
                onKeyDown={(event) => {
                  // Enter with nothing highlighted searches the full text.
                  if (
                    event.key === 'Enter' &&
                    trimmed &&
                    !document.querySelector('[cmdk-item][data-selected="true"]')
                  ) {
                    searchAll(trimmed);
                  }
                }}
              />
              <kbd className="hidden rounded-control px-2 py-1 text-caption text-ink-secondary ring-1 ring-hairline sm:inline">
                Esc
              </kbd>
            </div>
            <Command.List
              className={`max-h-[60vh] overflow-y-auto overscroll-contain p-2 ${groupHeadingClass}`}
            >
              {!trimmed && recent.length > 0 ? (
                <Command.Group heading={t('recent')}>
                  {recent.map((entry) => (
                    <Command.Item
                      key={entry}
                      value={`recent-${entry}`}
                      onSelect={() => {
                        searchAll(entry);
                      }}
                      className={itemClass}
                    >
                      <Clock
                        aria-hidden="true"
                        className="size-4 text-ink-secondary"
                        strokeWidth={1.5}
                      />
                      {entry}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {!trimmed && recent.length === 0 ? (
                <p className="px-3 py-6 text-ink-secondary">{t('hint')}</p>
              ) : null}

              {trimmed ? (
                <Command.Item
                  value={`all-${trimmed}`}
                  onSelect={() => {
                    searchAll(trimmed);
                  }}
                  className={itemClass}
                >
                  <Search
                    aria-hidden="true"
                    className="size-4 text-ink-secondary"
                    strokeWidth={1.5}
                  />
                  <span className="flex-1">{t('searchFor', { query: trimmed })}</span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 text-ink-secondary"
                    strokeWidth={1.5}
                  />
                </Command.Item>
              ) : null}

              {results && results.products.length > 0 ? (
                <Command.Group heading={t('products')}>
                  {results.products.map((product) => (
                    <Command.Item
                      key={product.slug}
                      value={`product-${product.slug}`}
                      onSelect={() => {
                        go(`/p/${product.slug}`, trimmed);
                      }}
                      className={itemClass}
                    >
                      <span className="relative size-12 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                        {product.image ? (
                          <ProductImage
                            src={product.image.url}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-contain p-1"
                          />
                        ) : null}
                      </span>
                      <span className="flex-1 font-medium">{product.name}</span>
                      <span className="tabular text-ink-secondary">
                        {formatPrice(product.priceMinor)}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {results && results.categories.length > 0 ? (
                <Command.Group heading={t('categories')}>
                  {results.categories.map((category) => (
                    <Command.Item
                      key={category.slug}
                      value={`category-${category.slug}`}
                      onSelect={() => {
                        go(`/shop/${category.slug}`);
                      }}
                      className={itemClass}
                    >
                      <Folder
                        aria-hidden="true"
                        className="size-4 text-ink-secondary"
                        strokeWidth={1.5}
                      />
                      {category.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {results && results.collections.length > 0 ? (
                <Command.Group heading={t('collections')}>
                  {results.collections.map((collection) => (
                    <Command.Item
                      key={collection.slug}
                      value={`collection-${collection.slug}`}
                      onSelect={() => {
                        go(`/collections/${collection.slug}`);
                      }}
                      className={itemClass}
                    >
                      <Layers
                        aria-hidden="true"
                        className="size-4 text-ink-secondary"
                        strokeWidth={1.5}
                      />
                      {collection.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {results && results.articles.length > 0 ? (
                <Command.Group heading={t('help')}>
                  {results.articles.map((article) => (
                    <Command.Item
                      key={article.slug}
                      value={`article-${article.slug}`}
                      onSelect={() => {
                        go(`/help#${article.slug}`);
                      }}
                      className={itemClass}
                    >
                      <HelpCircle
                        aria-hidden="true"
                        className="size-4 text-ink-secondary"
                        strokeWidth={1.5}
                      />
                      {article.title}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {empty ? (
                <p className="px-3 py-6 text-ink-secondary">
                  {t('noResults', { query: debounced })}
                </p>
              ) : null}
              {isError ? <p className="px-3 py-6 text-danger-ink">{t('error')}</p> : null}
            </Command.List>
            <div aria-live="polite" className="sr-only">
              {isFetching
                ? t('loading')
                : results
                  ? t('resultCount', { count: results.products.length })
                  : ''}
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SearchPalette(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <QueryProvider>
      <SearchPaletteContent {...props} />
    </QueryProvider>
  );
}
