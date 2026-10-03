'use client';

import { Camera } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useRef, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

// The dialog, three.js and MediaPipe load only when try-on is first opened.
const TryOnDialog = dynamic(() => import('./try-on-dialog'), { ssr: false });

/**
 * "Try on" from a product page or card. Opens try-on over the page, so
 * you keep your place; the dialog's code loads on the first press.
 */
export function TryOnButton({
  slug,
  name,
  variantId,
  size = 'lg',
  compact = false,
  className,
}: {
  slug: string;
  name: string;
  variantId?: string;
  size?: 'md' | 'lg';
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations('tryOn');
  const trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const [mounted, setMounted] = useState(false);
  const onClick = (event: MouseEvent) => {
    // On a card the button sits over the product link: open try-on, don't follow it.
    event.preventDefault();
    event.stopPropagation();
    setMounted(true);
    setOpened(true);
  };
  return (
    <>
      {compact ? (
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-label={t('openNamed', { name })}
          onClick={onClick}
          className={cn(
            'duration-micro inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-surface/80 backdrop-blur transition-colors ease-standard hover:bg-surface',
            className,
          )}
        >
          <Camera aria-hidden="true" className="size-5 text-ink" strokeWidth={1.5} />
        </button>
      ) : (
        <Button
          ref={trigger}
          variant="secondary"
          size={size}
          aria-haspopup="dialog"
          className={className}
          onClick={onClick}
        >
          <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('open')}
        </Button>
      )}
      {mounted ? (
        <TryOnDialog
          open={opened}
          onOpenChange={setOpened}
          returnFocusTo={trigger}
          slug={slug}
          variantId={variantId}
        />
      ) : null}
    </>
  );
}
