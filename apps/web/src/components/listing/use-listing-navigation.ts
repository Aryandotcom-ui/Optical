'use client';

import type { ListingQuery } from '@optical/shared/catalog';
import { toListingQueryString } from '@optical/shared/catalog/lite';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { omitKeys } from '@/lib/objects';
import { useCallback, useEffect, useRef, useTransition } from 'react';

const DEBOUNCE_MS = 150;

/**
 * Applies listing changes by rewriting the URL (debounced), so filters
 * survive back/forward and links can be shared. `fixed` keys (the page's
 * own category or collection) are never written to the query string.
 */
export function useListingNavigation(query: ListingQuery, fixed: Partial<ListingQuery>) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The newest query, including changes not yet in the URL, so quick
  // successive edits build on each other instead of on a stale render.
  const latest = useRef(query);

  useEffect(() => {
    latest.current = query;
  }, [query]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const navigate = useCallback(
    (next: ListingQuery, immediate = false) => {
      latest.current = next;
      const go = () => {
        const params = toListingQueryString(omitKeys(next, Object.keys(fixed)));
        startTransition(() => {
          router.replace(`${pathname}${params ? `?${params}` : ''}` as Route, { scroll: false });
        });
      };
      if (timer.current) clearTimeout(timer.current);
      if (immediate) go();
      else timer.current = setTimeout(go, DEBOUNCE_MS);
    },
    [fixed, pathname, router],
  );

  /** Changing any filter returns to the first page. */
  const update = useCallback(
    (patch: Partial<ListingQuery>, immediate = false) => {
      navigate({ ...latest.current, ...patch, page: 1 }, immediate);
    },
    [navigate],
  );

  return { update, navigate, pending, current: latest };
}
