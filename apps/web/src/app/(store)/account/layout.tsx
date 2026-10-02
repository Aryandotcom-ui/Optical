import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AccountShell } from '@/components/account/account-shell';
import { WithMessages } from '@/components/providers/with-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  // Personal pages: never indexed or cached by search engines.
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <WithMessages namespaces={['account', 'auth', 'order', 'checkout', 'configurator']}>
        <AccountShell>{children}</AccountShell>
      </WithMessages>
    </div>
  );
}
