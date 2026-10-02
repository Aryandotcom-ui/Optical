'use client';

import { useEffect, useState } from 'react';

type RemoteState<T> =
  { status: 'idle' | 'loading' } | { status: 'success'; data: T } | { status: 'error' };

/** Results from this page view, so returning to a page shows data at once. */
const cache = new Map<string, unknown>();

/**
 * Loads data in the browser for a cache key: cancels the request if the key
 * changes or the component unmounts, and reuses results already fetched in
 * this page view. Pass a null key to skip loading. Deliberately small; the
 * search palette, which needs debouncing and placeholder data, uses
 * TanStack Query instead.
 */
export function useRemote<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): RemoteState<T> {
  const [state, setState] = useState<{ key: string | null; value: RemoteState<T> }>({
    key: null,
    value: { status: 'idle' },
  });

  useEffect(() => {
    if (key === null || cache.has(key)) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        cache.set(key, data);
        setState({ key, value: { status: 'success', data } });
      },
      () => {
        if (!controller.signal.aborted) setState({ key, value: { status: 'error' } });
      },
    );
    return () => {
      controller.abort();
    };
    // `load` is expected to change with `key`; the key alone decides when to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { status: 'idle' };
  if (cache.has(key)) return { status: 'success', data: cache.get(key) as T };
  return state.key === key ? state.value : { status: 'loading' };
}

/**
 * The union of every value seen so far, in first-seen order. Lets a list
 * fetch once for the items it starts with and only refetch when one is
 * added, not when one is removed (the view just filters what it has).
 */
export function useGrowingSet(values: readonly string[], enabled: boolean): string[] | null {
  const [seen, setSeen] = useState<string[] | null>(null);
  if (!enabled) return seen;
  if (seen === null) {
    setSeen([...values]);
    return values.slice();
  }
  const added = values.filter((value) => !seen.includes(value));
  if (added.length > 0) {
    const next = [...seen, ...added];
    setSeen(next);
    return next;
  }
  return seen;
}
