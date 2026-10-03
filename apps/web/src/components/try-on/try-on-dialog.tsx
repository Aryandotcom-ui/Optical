'use client';

import dynamic from 'next/dynamic';
import { useEffect, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import SheetDialog from '@/components/ui/sheet-dialog';
import { useTryOn } from '@/stores/try-on';

const TryOnExperience = dynamic(() => import('./try-on-experience'), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full rounded-media" />,
});

/**
 * Try-on over the current page (product page or card), full screen. The
 * frame joins the try-on session, so the carousel keeps earlier ones.
 * Loaded only when a "Try on" button is first pressed.
 */
export default function TryOnDialog({
  open,
  onOpenChange,
  returnFocusTo,
  slug,
  variantId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
  slug: string;
  variantId?: string | undefined;
}) {
  const t = useTranslations('tryOn');
  const openSession = useTryOn((state) => state.open);
  const setColour = useTryOn((state) => state.setColour);
  useEffect(() => {
    if (!open) return;
    openSession([slug], slug);
    if (variantId) setColour(slug, variantId);
  }, [open, slug, variantId, openSession, setColour]);
  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      side="full"
      title={t('title')}
      closeLabel={t('close')}
    >
      {open ? (
        <div className="mx-auto max-w-content pb-8">
          <TryOnExperience
            autoStart={false}
            onNavigate={() => {
              onOpenChange(false);
            }}
          />
        </div>
      ) : null}
    </SheetDialog>
  );
}
