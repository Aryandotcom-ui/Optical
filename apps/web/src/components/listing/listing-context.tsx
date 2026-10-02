'use client';

import type { ListingQuery } from '@optical/shared/catalog';
import { createContext, use, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useListingNavigation } from './use-listing-navigation';

interface ListingContextValue {
  query: ListingQuery;
  fixed: Partial<ListingQuery>;
  update: (patch: Partial<ListingQuery>, immediate?: boolean) => void;
  pending: boolean;
}

const ListingContext = createContext<ListingContextValue | null>(null);

export function useListing(): ListingContextValue {
  const value = use(ListingContext);
  if (!value) throw new Error('useListing must be used inside <ListingProvider>.');
  return value;
}

export function ListingProvider({
  query,
  fixed,
  children,
}: {
  query: ListingQuery;
  fixed: Partial<ListingQuery>;
  children: ReactNode;
}) {
  const { update, pending } = useListingNavigation(query, fixed);
  return <ListingContext value={{ query, fixed, update, pending }}>{children}</ListingContext>;
}

/** Dims results while new ones load, so taps feel acknowledged instantly. */
export function PendingResults({ children }: { children: ReactNode }) {
  const { pending } = useListing();
  return (
    <div
      aria-busy={pending}
      className={cn('duration-ui transition-opacity ease-standard', pending && 'opacity-50')}
    >
      {children}
    </div>
  );
}
