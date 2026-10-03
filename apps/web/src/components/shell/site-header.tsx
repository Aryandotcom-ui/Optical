'use client';

import { Heart, Menu, ShoppingBag, UserRound } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Wordmark } from '@/components/brand/wordmark';
import { LazySheet } from '@/components/ui/lazy-sheet';
import { cn } from '@/lib/cn';
import type { NavModel } from '@/lib/nav';
import { bagCount } from '@/stores/bag';
import { useSavedLists, useSavedListsHydrated } from '@/stores/saved-lists';
import { MegaMenu } from './mega-menu';
import { SearchLauncher } from './search-launcher';
import { useScrollChrome } from './use-scroll-chrome';

/** Routes whose first section sits under a transparent header. */
const OVERLAY_ROUTES = new Set(['/']);

function WishlistLink() {
  const t = useTranslations('shell');
  const hydrated = useSavedListsHydrated();
  const count = useSavedLists((state) => state.wishlist.length);
  const shown = hydrated ? count : 0;
  return (
    <Link
      href="/wishlist"
      aria-label={shown ? t('wishlistWithCount', { count: shown }) : t('wishlist')}
      className="relative inline-flex size-11 items-center justify-center rounded-pill text-ink transition-colors hover:bg-ink/5"
    >
      <Heart aria-hidden="true" className="size-5" strokeWidth={1.5} />
      {shown ? (
        <span
          key={shown}
          className="tabular absolute top-1.5 right-1 min-w-4.5 animate-fade-in rounded-pill bg-accent-strong px-1 text-center text-[0.6875rem] leading-4.5 font-semibold text-on-accent"
        >
          {shown}
        </span>
      ) : null}
    </Link>
  );
}

/** Your account; guests are taken to sign in from there. Never a popup. */
function AccountLink() {
  const t = useTranslations('shell');
  return (
    <Link
      href="/account"
      aria-label={t('account')}
      className="hidden size-11 items-center justify-center rounded-pill text-ink transition-colors hover:bg-ink/5 md:inline-flex"
    >
      <UserRound aria-hidden="true" className="size-5" strokeWidth={1.5} />
    </Link>
  );
}

/** The bag, with the number of items kept in this browser (see stores/bag.ts). */
function BagLink() {
  const t = useTranslations('shell');
  const count = bagCount.useValue();
  return (
    <Link
      href="/cart"
      aria-label={count ? t('bagWithCount', { count }) : t('bag')}
      className="relative inline-flex size-11 items-center justify-center rounded-pill text-ink transition-colors hover:bg-ink/5"
    >
      <ShoppingBag aria-hidden="true" className="size-5" strokeWidth={1.5} />
      {count ? (
        <span
          key={count}
          className="tabular absolute top-1.5 right-1 min-w-4.5 animate-fade-in rounded-pill bg-accent-strong px-1 text-center text-[0.6875rem] leading-4.5 font-semibold text-on-accent"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function MobileMenu({ nav }: { nav: NavModel }) {
  const t = useTranslations('shell');
  const tShape = useTranslations('filters.shapeValues');
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // Links navigate client-side, so the sheet closes itself on any link tap.
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('openMenu')}
        onClick={() => {
          setOpen(true);
        }}
        className="inline-flex size-11 items-center justify-center rounded-pill text-ink hover:bg-ink/5 lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </button>
      <LazySheet
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={trigger}
        side="right"
        title={t('menu')}
        closeLabel={t('closeMenu')}
      >
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- delegated: the links inside handle keys themselves */}
        <nav aria-label={t('primaryNav')} className="space-y-8 pt-2" onClick={closeOnLink}>
          <section>
            <h2 className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
              {t('byCategory')}
            </h2>
            <ul className="mt-2">
              {nav.categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/shop/${category.slug}` as Route}
                    className="flex min-h-12 items-center text-title font-semibold"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
              {t('byShape')}
            </h2>
            <ul className="mt-2 grid grid-cols-2">
              {nav.shapes.map((shape) => (
                <li key={shape}>
                  <Link
                    href={`/shop?shape=${shape}` as Route}
                    className="flex min-h-11 items-center"
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
            <ul className="mt-2">
              {nav.collections.map((collection) => (
                <li key={collection.slug}>
                  <Link
                    href={`/collections/${collection.slug}` as Route}
                    className="flex min-h-11 items-center"
                  >
                    {collection.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <ul>
            {nav.features?.virtualTryOn === false ? null : (
              <li>
                <Link href="/try-on" className="flex min-h-11 items-center font-medium">
                  {t('tryOn')}
                </Link>
              </li>
            )}
            {nav.features?.frameFinder === false ? null : (
              <li>
                <Link href="/frame-finder" className="flex min-h-11 items-center font-medium">
                  {t('frameFinder')}
                </Link>
              </li>
            )}
            <li>
              <Link href="/help" className="flex min-h-11 items-center font-medium">
                {t('help')}
              </Link>
            </li>
          </ul>
        </nav>
      </LazySheet>
    </>
  );
}

/**
 * Site header: transparent over the home hero, frosted once you scroll,
 * tucked away while scrolling down and back on the way up. It is sticky,
 * so it never causes layout shift.
 */
export function SiteHeader({ nav }: { nav: NavModel }) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const { scrolled, hidden } = useScrollChrome();
  const overlay = OVERLAY_ROUTES.has(pathname) && !scrolled;

  return (
    <header
      className={cn(
        'duration-ui sticky top-0 z-40 transition-[transform,background-color,box-shadow,backdrop-filter] ease-standard motion-reduce:transition-none',
        hidden && '-translate-y-full',
        overlay
          ? 'bg-transparent'
          : 'bg-background/80 shadow-[0_1px_0_var(--color-hairline)] backdrop-blur-xl backdrop-saturate-150',
      )}
    >
      <div className="mx-auto flex h-16 max-w-content items-center gap-2 px-gutter">
        <MobileMenu nav={nav} />
        <Link href="/" className="mr-4 inline-flex min-h-11 items-center" aria-label={t('home')}>
          <Wordmark className="text-headline" />
        </Link>
        <MegaMenu nav={nav} />
        <div className="ml-auto flex items-center gap-1">
          <SearchLauncher />
          <WishlistLink />
          <AccountLink />
          <BagLink />
        </div>
      </div>
    </header>
  );
}
