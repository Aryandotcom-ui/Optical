'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/account-api';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { LoadingBlock } from './load-states';

const links = [
  { href: '/account', key: 'overview' },
  { href: '/account/orders', key: 'orders' },
  { href: '/account/prescriptions', key: 'prescriptions' },
  { href: '/account/addresses', key: 'addresses' },
  { href: '/account/settings', key: 'settings' },
] as const;

/**
 * The account area: section navigation and a gate that sends guests to
 * sign in (and back here afterwards). Rendered in the browser; the API
 * decides what each customer may see.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations('account.nav');
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'signed-out')
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}` as Route);
  }, [session.status, pathname, router]);

  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
      <nav aria-label={t('label')} className="-mx-gutter overflow-x-auto px-gutter lg:mx-0 lg:px-0">
        <ul className="flex gap-1 lg:flex-col">
          {links.map((link) => {
            const active =
              link.href === '/account' ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-pill px-4 whitespace-nowrap transition-colors',
                    active ? 'bg-ink font-medium text-background' : 'hover:bg-surface-muted',
                  )}
                >
                  {t(link.key)}
                </Link>
              </li>
            );
          })}
          <li className="lg:mt-4">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                void authApi.logout().then(() => {
                  router.replace('/');
                });
              }}
            >
              {t('signOut')}
            </Button>
          </li>
        </ul>
      </nav>
      <div className="min-w-0">{session.status === 'signed-in' ? children : <LoadingBlock />}</div>
    </div>
  );
}
