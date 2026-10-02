'use client';

import { useTranslations } from 'next-intl';
import { ProductCard } from '@/components/product/product-card';
import { Skeleton } from '@/components/ui/skeleton';
import { call } from '@/lib/bag-api';
import { fetchProductsByIds } from '@/lib/browser-api';
import { useRemote } from '@/lib/use-remote';

/** Someone else's wishlist, read-only. Details are fetched fresh, so prices are current. */
export function SharedWishlist({ token }: { token: string }) {
  const t = useTranslations('wishlistPage');
  const remote = useRemote(`shared-wishlist:${token}`, async (signal) => {
    const list = await call<{ items: { id: string }[] }>(
      'GET',
      `/v1/wishlists/${encodeURIComponent(token)}`,
    );
    const ids = list.items.map((item) => item.id);
    const products = ids.length ? await fetchProductsByIds(ids, signal) : [];
    return ids.flatMap((id) => products.find((product) => product.id === id) ?? []);
  });

  if (remote.status === 'error')
    return <p className="rounded-card bg-surface-muted p-6">{t('sharedMissing')}</p>;
  if (remote.status !== 'success')
    return (
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index}>
            <Skeleton className="aspect-[4/3] w-full rounded-media" />
            <Skeleton className="mt-3 h-5 w-2/3" />
          </li>
        ))}
      </ul>
    );
  return (
    <div>
      <p className="text-caption text-ink-secondary" aria-live="polite">
        {t('count', { count: remote.data.length })}
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {remote.data.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
}
