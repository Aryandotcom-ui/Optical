'use client';

import { Heart, Home, LayoutGrid, UserRound } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { SearchLauncher } from './search-launcher';

const tabs = [
  { href: '/', key: 'home', icon: Home, match: (path: string) => path === '/' },
  {
    href: '/shop',
    key: 'shop',
    icon: LayoutGrid,
    match: (path: string) =>
      path.startsWith('/shop') || path.startsWith('/collections') || path.startsWith('/p/'),
  },
  {
    href: '/wishlist',
    key: 'wishlist',
    icon: Heart,
    match: (path: string) => path.startsWith('/wishlist'),
  },
] as const;

const accountPaths = ['/account', '/sign-in', '/register', '/forgot-password', '/reset-password'];

/**
 * Bottom navigation for phones: large tap targets, safe-area aware. Try-on
 * joins it when that feature ships (Phase 5).
 */
export function MobileTabBar() {
  const t = useTranslations('shell');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('tabBar')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="flex">
        {tabs.slice(0, 2).map((tab) => (
          <TabLink
            key={tab.key}
            href={tab.href}
            label={t(tab.key)}
            Icon={tab.icon}
            active={tab.match(pathname)}
          />
        ))}
        <li className="flex flex-1">
          <SearchLauncher variant="tab" />
        </li>
        {tabs.slice(2).map((tab) => (
          <TabLink
            key={tab.key}
            href={tab.href}
            label={t(tab.key)}
            Icon={tab.icon}
            active={tab.match(pathname)}
          />
        ))}
        <TabLink
          href="/account"
          label={t('account')}
          Icon={UserRound}
          active={accountPaths.some((path) => pathname.startsWith(path))}
        />
      </ul>
    </nav>
  );
}

function TabLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof Home;
  active: boolean;
}) {
  return (
    <li className="flex flex-1">
      <Link
        href={href as Route}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium',
          active ? 'text-ink' : 'text-ink-secondary',
        )}
      >
        <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2 : 1.5} />
        {label}
      </Link>
    </li>
  );
}
