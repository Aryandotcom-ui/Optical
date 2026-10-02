'use client';

import { Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

// The palette (and cmdk) load on first use, keeping them out of the initial bundle.
const SearchPalette = dynamic(
  () => import('./search-palette').then((module) => module.SearchPalette),
  { ssr: false },
);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Search button. The header's launcher also owns the "/" and ⌘K / Ctrl+K
 * shortcuts; the mobile tab bar's doesn't, so a shortcut opens one palette.
 */
export function SearchLauncher({
  className,
  variant = 'icon',
}: {
  className?: string;
  variant?: 'icon' | 'tab';
}) {
  const t = useTranslations('search');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const shortcuts = variant === 'icon';

  useEffect(() => {
    if (!shortcuts) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const commandK = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      const slash = event.key === '/' && !isTypingTarget(event.target);
      if (commandK || slash) {
        event.preventDefault();
        setLoaded(true);
        setOpen((value) => !value || !commandK);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shortcuts]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        onPointerEnter={() => {
          setLoaded(true);
        }}
        aria-keyshortcuts={shortcuts ? '/ Control+K Meta+K' : undefined}
        aria-label={variant === 'icon' ? t('open') : undefined}
        className={cn(
          variant === 'icon'
            ? 'inline-flex size-11 items-center justify-center rounded-pill text-ink transition-colors hover:bg-ink/5'
            : 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-ink-secondary',
          className,
        )}
      >
        <Search aria-hidden="true" className="size-5" strokeWidth={1.5} />
        {variant === 'tab' ? t('tab') : null}
      </button>
      {loaded ? <SearchPalette open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
