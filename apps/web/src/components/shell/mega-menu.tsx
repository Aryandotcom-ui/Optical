'use client';

import { ChevronDown } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import type { NavModel } from '@/lib/nav';
import { cn } from '@/lib/cn';

const triggerClass =
  'inline-flex min-h-11 items-center gap-1 rounded-pill px-4 text-body font-medium text-ink transition-colors duration-micro ease-standard hover:bg-ink/5 aria-expanded:bg-ink/5';

/** Hover intent: open after a short pause, close a little later, so passing pointers don't flicker it. */
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 200;

/**
 * Desktop navigation, built as a disclosure (the WAI-ARIA pattern for site
 * navigation): a button that shows and hides a panel of plain links. It opens
 * on click, Enter or Space, and on hover after a short delay; Escape, a click
 * outside, moving focus away or following a link closes it.
 */
export function MegaMenu({ nav }: { nav: NavModel }) {
  const t = useTranslations('shell');
  const tShape = useTranslations('filters.shapeValues');
  const frameCategories = nav.categories.filter((category) => category.slug !== 'accessories');
  const [open, setOpen] = useState(false);
  const item = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelId = useId();
  const pathname = usePathname();
  const [shownFor, setShownFor] = useState(pathname);
  // A navigation (even via the browser's back button) closes the panel.
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  const later = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setOpen(next);
    }, delay);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!item.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  };

  return (
    <nav className="relative hidden lg:block" aria-label={t('primaryNav')}>
      <ul className="flex items-center gap-1">
        {/* Hover intent and focus-out are enhancements; the button inside is the real control. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above */}
        <li
          ref={item}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') later(true, OPEN_DELAY_MS);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') later(false, CLOSE_DELAY_MS);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
          }}
        >
          <button
            ref={button}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => {
              clearTimeout(timer.current);
              setOpen((value) => !value);
            }}
            className={triggerClass}
          >
            {t('shop')}
            <ChevronDown
              aria-hidden="true"
              strokeWidth={1.5}
              className={cn(
                'duration-ui size-4 transition-transform ease-standard',
                open && 'rotate-180',
              )}
            />
          </button>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegated: the links inside handle keys themselves */}
          <div
            id={panelId}
            hidden={!open}
            onClick={closeOnLink}
            className="absolute top-full left-0 z-50 pt-2"
          >
            <div className="animate-fade-in rounded-card bg-surface shadow-overlay ring-1 ring-hairline">
              <div className="grid w-[min(56rem,calc(100vw-4rem))] grid-cols-[1.2fr_1fr_1fr] gap-8 p-8">
                <section>
                  <h2 className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
                    {t('byCategory')}
                  </h2>
                  <ul className="mt-3 space-y-1">
                    {nav.categories.map((category) => (
                      <li key={category.slug}>
                        <Link
                          href={`/shop/${category.slug}` as Route}
                          className="group block rounded-control px-3 py-2 hover:bg-surface-muted"
                        >
                          <span className="block font-medium group-hover:text-accent">
                            {category.name}
                          </span>
                          <span className="block text-caption text-ink-secondary">
                            {category.description}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h2 className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
                    {t('byShape')}
                  </h2>
                  <ul className="mt-3 grid grid-cols-2 gap-1">
                    {nav.shapes.map((shape) => (
                      <li key={shape}>
                        <Link
                          href={`/shop?shape=${shape}` as Route}
                          className="block rounded-control px-3 py-2 hover:bg-surface-muted hover:text-accent"
                        >
                          {tShape(shape)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h2 className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
                    {t('collections')}
                  </h2>
                  <ul className="mt-3 space-y-1">
                    {nav.collections.map((collection) => (
                      <li key={collection.slug}>
                        <Link
                          href={`/collections/${collection.slug}` as Route}
                          className="block rounded-control px-3 py-2 hover:bg-surface-muted hover:text-accent"
                        >
                          {collection.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </li>
        {frameCategories.slice(0, 3).map((category) => (
          <li key={category.slug}>
            <Link href={`/shop/${category.slug}` as Route} className={triggerClass}>
              {category.name}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/try-on" className={triggerClass}>
            {t('tryOn')}
          </Link>
        </li>
        <li>
          <Link href="/help" className={triggerClass}>
            {t('help')}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
