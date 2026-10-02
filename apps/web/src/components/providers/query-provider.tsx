'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

let client: QueryClient | null = null;

/** One cache for the whole tab, created on first use. */
function getQueryClient(): QueryClient {
  client ??= new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
  });
  return client;
}

/**
 * Server state for the few interactive views that fetch from the browser
 * (search suggestions, wishlist, compare). Scoped to them rather than wrapped
 * around the app, so pages that never fetch don't download the query library.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
