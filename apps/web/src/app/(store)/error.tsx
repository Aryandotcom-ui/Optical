'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** Storefront error boundary: the header and footer stay, so people can carry on browsing. */
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');
  const tc = useTranslations('common');
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-prose flex-col justify-center px-gutter py-section">
      <h1 className="text-display-md font-semibold text-balance">{t('storeTitle')}</h1>
      <p className="mt-4 text-body-lg text-ink-secondary">{t('storeBody')}</p>
      {error.digest ? (
        <p className="tabular mt-3 text-caption text-ink-secondary">
          {t('reference', { digest: error.digest })}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" onClick={reset}>
          {tc('tryAgain')}
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/">{tc('goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
