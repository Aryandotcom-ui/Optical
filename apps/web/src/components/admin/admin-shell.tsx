'use client';

import type { AdminArea, AdminMe } from '@optical/shared/admin';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Wordmark } from '@/components/brand/wordmark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { adminGet, CommerceError } from './admin-api';
import { AdminContext } from './admin-context';

const NAV: { area: AdminArea; href: string; label: string }[] = [
  { area: 'dashboard', href: '/admin', label: 'Dashboard' },
  { area: 'orders', href: '/admin/orders', label: 'Orders' },
  { area: 'prescriptions', href: '/admin/prescriptions', label: 'Prescriptions' },
  { area: 'products', href: '/admin/products', label: 'Products' },
  { area: 'inventory', href: '/admin/inventory', label: 'Inventory' },
  { area: 'lens', href: '/admin/lens', label: 'Lens catalogue' },
  { area: 'customers', href: '/admin/customers', label: 'Customers' },
  { area: 'coupons', href: '/admin/coupons', label: 'Coupons' },
  { area: 'reviews', href: '/admin/reviews', label: 'Reviews' },
  { area: 'content', href: '/admin/content', label: 'Help articles' },
  { area: 'settings', href: '/admin/settings', label: 'Settings' },
  { area: 'audit', href: '/admin/audit', label: 'Audit log' },
];

type State =
  | { status: 'loading' }
  | { status: 'ready'; me: AdminMe }
  | { status: 'out' | 'forbidden' | 'error' };

/**
 * The admin frame: checks who is signed in, then shows the areas their role
 * can open. The API checks every request again; this only shapes the UI.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const pathname = usePathname();

  useEffect(() => {
    adminGet<AdminMe>('/me').then(
      (me) => {
        setState({ status: 'ready', me });
      },
      (error: unknown) => {
        const status = error instanceof CommerceError ? error.status : 0;
        setState({ status: status === 401 ? 'out' : status === 403 ? 'forbidden' : 'error' });
      },
    );
  }, []);

  if (state.status !== 'ready') {
    return (
      <main
        id="main"
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-gutter"
      >
        <Wordmark className="h-6 w-auto" />
        {state.status === 'loading' ? <p aria-live="polite">Checking your access…</p> : null}
        {state.status === 'out' ? (
          <>
            <h1 className="text-title font-semibold">Sign in to the admin</h1>
            <p className="text-ink-secondary">Use your team account.</p>
            <Button asChild>
              <Link href={`/sign-in?next=${encodeURIComponent(pathname)}` as Route}>Sign in</Link>
            </Button>
          </>
        ) : null}
        {state.status === 'forbidden' ? (
          <>
            <h1 className="text-title font-semibold">This area is for the store team</h1>
            <p className="text-ink-secondary">
              Your account doesn’t have access. Ask an admin if you need it.
            </p>
            <Button asChild variant="secondary">
              <Link href="/">Back to the shop</Link>
            </Button>
          </>
        ) : null}
        {state.status === 'error' ? (
          <p role="alert">We couldn’t reach the API. Check that it is running, then reload.</p>
        ) : null}
      </main>
    );
  }

  const allowed = new Set(state.me.areas.map((entry) => entry.area));
  const nav = NAV.filter((item) => allowed.has(item.area));
  const isCurrent = (href: string) =>
    href === '/admin' ? pathname === href : pathname.startsWith(href);
  // The area this page belongs to (longest matching link), so a role that
  // can't open it gets a clear message instead of a page that can't load.
  const section = NAV.filter((item) => isCurrent(item.href)).at(-1);
  const blocked = section !== undefined && !allowed.has(section.area);

  return (
    <AdminContext.Provider value={state.me}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
        <aside className="border-b border-hairline bg-surface lg:min-h-dvh lg:border-r lg:border-b-0 print:hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <Link href="/admin" className="flex items-center gap-2" aria-label="Admin home">
              <Wordmark className="h-5 w-auto" />
              <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-caption">Admin</span>
            </Link>
          </div>
          <nav aria-label="Admin" className="overflow-x-auto px-3 pb-3 lg:pb-6">
            <ul className="flex gap-1 lg:flex-col">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href as Route}
                    aria-current={isCurrent(item.href) ? 'page' : undefined}
                    className={cn(
                      'block rounded-control px-3 py-2 whitespace-nowrap hover:bg-surface-muted',
                      isCurrent(item.href) && 'bg-surface-muted font-medium',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="hidden px-5 pb-6 text-caption text-ink-secondary lg:block">
            <p className="font-medium text-ink">{state.me.name}</p>
            <p>{state.me.role === 'ADMIN' ? 'Admin' : 'Staff'}</p>
            <Link href="/" className="mt-2 inline-block text-accent hover:underline">
              View the shop
            </Link>
          </div>
        </aside>
        <main id="main" className="min-w-0 px-gutter py-8 lg:px-10">
          {blocked ? (
            <div role="alert" className="max-w-prose">
              <h1 className="text-headline font-semibold">Your role can’t open this page</h1>
              <p className="mt-2 text-ink-secondary">Ask an admin if you need access.</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </AdminContext.Provider>
  );
}
