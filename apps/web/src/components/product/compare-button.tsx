'use client';

import { GitCompareArrows } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { COMPARE_LIMIT, useSavedLists, useSavedListsHydrated } from '@/stores/saved-lists';

/** Adds a frame to the side-by-side comparison (up to four). */
export function CompareButton({
  id,
  slug,
  name,
  className,
}: {
  id: string;
  slug: string;
  name: string;
  className?: string;
}) {
  const t = useTranslations('compare');
  const router = useRouter();
  const hydrated = useSavedListsHydrated();
  const inList = useSavedLists((state) => state.compare.some((item) => item.id === id));
  const toggle = useSavedLists((state) => state.toggleCompare);
  const active = hydrated && inList;

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        const result = toggle({ id, slug });
        const view = {
          label: t('view'),
          onClick: () => {
            router.push('/compare');
          },
        };
        if (result === 'added') void notify(t('added', { name }), { action: view });
        else if (result === 'removed') void notify(t('removed', { name }));
        else void notify(t('full', { limit: COMPARE_LIMIT }), { action: view });
      }}
      className={cn(
        'duration-micro inline-flex min-h-11 items-center justify-center gap-2 rounded-pill px-5 font-medium ring-1 transition-colors ease-standard ring-inset',
        active ? 'bg-ink text-background ring-ink' : 'ring-hairline hover:ring-ink-secondary',
        className,
      )}
    >
      <GitCompareArrows aria-hidden="true" className="size-5" strokeWidth={1.5} />
      {active ? t('inCompare') : t('add')}
    </button>
  );
}
