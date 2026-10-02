'use client';

import type { OrderView } from '@optical/shared/checkout';
import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CommerceError, commerceApi } from '@/lib/commerce-api';

/**
 * The local payment simulator. Choosing an outcome doesn't change the order
 * directly: the result arrives as a signed webhook through the background
 * worker, exactly like a real provider, and the page follows along.
 */
export function MockPayment({
  paymentId,
  token,
  onSent,
}: {
  paymentId: string;
  token: string;
  onSent: (order: OrderView) => void;
}) {
  const t = useTranslations('order.mock');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (outcome: 'success' | 'failure' | 'pending') => {
    setBusy(true);
    setError(null);
    try {
      onSent(await commerceApi.simulatePayment(paymentId, outcome, token));
    } catch (problem) {
      setError(problem instanceof CommerceError ? problem.message : t('failed'));
      setBusy(false);
    }
  };
  return (
    <section
      aria-labelledby="mock-payment"
      className="rounded-card bg-surface p-6 ring-1 ring-hairline ring-inset"
    >
      <h2 id="mock-payment" className="flex items-center gap-2 text-title font-semibold">
        <FlaskConical aria-hidden="true" className="size-5 text-accent" strokeWidth={1.5} />
        {t('title')}
      </h2>
      <p className="mt-2 text-ink-secondary">{t('body')}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => void send('success')}>
          {t('success')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void send('failure')}>
          {t('failure')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void send('pending')}>
          {t('pending')}
        </Button>
      </div>
      <p aria-live="polite" className="mt-3 text-caption text-ink-secondary">
        {busy ? t('waiting') : null}
        <span className="text-danger-ink">{error}</span>
      </p>
    </section>
  );
}
