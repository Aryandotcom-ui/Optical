'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');
  const tc = useTranslations('common');
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-prose flex-col justify-center px-gutter py-section"
    >
      <h1 className="text-display-md font-semibold text-balance">{t('title')}</h1>
      <p className="mt-4 text-body-lg text-ink-secondary">{t('body')}</p>
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
    </main>
  );
}
