'use client';

import { Heart } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchProductsByIds } from '@/lib/browser-api';
import { useGrowingSet, useRemote } from '@/lib/use-remote';
import dynamic from 'next/dynamic';
import { useSignedInHint } from '@/lib/signed-in';
import { useSavedLists, useSavedListsHydrated } from '@/stores/saved-lists';

const WishlistAccount = dynamic(() =>
  import('./wishlist-account').then((module) => module.WishlistAccount),
);

/**
 * The wishlist: saved in this browser (and in the account when signed in),
 * details fetched fresh so prices and stock are current.
 */
export function WishlistView() {
  const t = useTranslations('wishlistPage');
  const signedIn = useSignedInHint();
  const hydrated = useSavedListsHydrated();
  const saved = useSavedLists((state) => state.wishlist);
  const ids = saved.map((item) => item.id);
  const toFetch = useGrowingSet(ids, hydrated);
  const remote = useRemote(toFetch?.length ? `wishlist:${toFetch.join(',')}` : null, (signal) =>
    fetchProductsByIds(toFetch ?? [], signal),
  );

  if (!hydrated || (ids.length > 0 && (remote.status === 'loading' || remote.status === 'idle'))) {
    return (
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: Math.max(1, Math.min(ids.length, 4)) }, (_, index) => (
          <li key={index}>
            <Skeleton className="aspect-[4/3] w-full rounded-media" />
            <Skeleton className="mt-3 h-5 w-2/3" />
          </li>
        ))}
      </ul>
    );
  }

  if (ids.length === 0) {
    return (
      <>
        <div className="rounded-media bg-surface-muted px-6 py-16 text-center">
          <Heart
            aria-hidden="true"
            className="mx-auto size-8 text-ink-secondary"
            strokeWidth={1.5}
          />
          <h2 className="mt-4 text-headline font-semibold">{t('emptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-ink-secondary">{t('emptyBody')}</p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/shop">{t('browse')}</Link>
          </Button>
        </div>
        {signedIn ? <WishlistAccount /> : null}
      </>
    );
  }

  if (remote.status === 'error') return <p className="text-danger-ink">{t('error')}</p>;

  // Keep the saved order, newest first; skip frames that are no longer sold.
  const fetched = remote.status === 'success' ? remote.data : [];
  const products = ids.flatMap((id) => fetched.find((product) => product.id === id) ?? []);
  const missing = ids.length - products.length;

  return (
    <div>
      <p className="text-caption text-ink-secondary" aria-live="polite">
        {t('count', { count: products.length })}
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
      {missing > 0 ? (
        <p className="mt-8 text-caption text-ink-secondary">{t('missing', { count: missing })}</p>
      ) : null}
      {signedIn ? (
        <WishlistAccount />
      ) : (
        <p className="mt-10 text-caption text-ink-secondary">{t('deviceNote')}</p>
      )}
    </div>
  );
}
