'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { useSavedLists, useSavedListsHydrated } from '@/stores/saved-lists';

/** Heart toggle with an optimistic update and a confirming toast. */
export function WishlistButton({
  id,
  slug,
  name,
  className,
  withLabel = false,
}: {
  id: string;
  slug: string;
  name: string;
  className?: string;
  withLabel?: boolean;
}) {
  const t = useTranslations('wishlist');
  const hydrated = useSavedListsHydrated();
  const saved = useSavedLists((state) => state.wishlist.some((item) => item.id === id));
  const toggle = useSavedLists((state) => state.toggleWishlist);
  const active = hydrated && saved;

  return (
    <button
      type="button"
      aria-pressed={active}
      // A toggle keeps one name; aria-pressed says whether it is on.
      aria-label={withLabel ? undefined : t('addNamed', { name })}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const added = toggle({ id, slug });
        void notify(added ? t('added', { name }) : t('removed', { name }));
      }}
      className={cn(
        'duration-micro inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-pill transition-colors ease-standard',
        withLabel
          ? 'px-5 ring-1 ring-hairline ring-inset hover:ring-ink-secondary'
          : 'bg-surface/80 backdrop-blur hover:bg-surface',
        className,
      )}
    >
      <Heart
        aria-hidden="true"
        strokeWidth={1.5}
        className={cn(
          'duration-micro size-5 transition-transform ease-standard',
          active ? 'scale-110 fill-danger text-danger' : 'text-ink',
        )}
      />
      {withLabel ? <span>{active ? t('saved') : t('save')}</span> : null}
    </button>
  );
}
