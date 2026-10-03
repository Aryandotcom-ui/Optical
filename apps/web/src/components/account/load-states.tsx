'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  const t = useTranslations('account');
  return (
    <div role="status" aria-label={t('loading')} className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-card" />
      ))}
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('account');
  return (
    <div role="alert" className="space-y-3 rounded-card bg-surface-muted p-6">
      <p>{t('loadFailed')}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}
