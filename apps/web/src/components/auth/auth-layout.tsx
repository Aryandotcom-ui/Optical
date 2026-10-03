import type { ReactNode } from 'react';
import { WithMessages } from '@/components/providers/with-messages';

/** A calm, narrow column for the sign-in pages. */
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md px-gutter pt-12 pb-section">
      <h1 className="text-display-md font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-ink-secondary">{intro}</p>
      <div className="mt-8 rounded-card bg-surface p-6 ring-1 ring-hairline ring-inset sm:p-8">
        <WithMessages namespaces={['auth', 'checkout']}>{children}</WithMessages>
      </div>
    </div>
  );
}
