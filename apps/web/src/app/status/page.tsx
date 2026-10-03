import {
  healthResponseSchema,
  readinessResponseSchema,
  type HealthResponse,
  type ReadinessResponse,
} from '@optical/shared/api';
import { commerce } from '@optical/config/commerce';
import { CircleCheck, CircleQuestionMark, CircleX, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Wordmark } from '@/components/brand/wordmark';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/cn';
import { deriveSystemStatus, type ServiceState } from './derive-status';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('status');
  return { title: t('title'), robots: { index: false, follow: false } };
}

const stateStyle: Record<ServiceState, { icon: LucideIcon; className: string }> = {
  up: { icon: CircleCheck, className: 'text-success-ink' },
  down: { icon: CircleX, className: 'text-danger-ink' },
  unknown: { icon: CircleQuestionMark, className: 'text-ink-secondary' },
};

export default async function StatusPage() {
  const t = await getTranslations('status');
  const [health, readiness] = await Promise.all([
    apiRequest('/healthz', healthResponseSchema),
    apiRequest('/readyz', readinessResponseSchema, { acceptStatuses: [200, 503] }),
  ]);
  const healthData: HealthResponse | null = health.ok ? health.data : null;
  const readinessData: ReadinessResponse | null = readiness.ok ? readiness.data : null;
  const status = deriveSystemStatus(healthData, readinessData);
  const checkedAt = new Intl.DateTimeFormat(commerce.locale, {
    timeStyle: 'medium',
    timeZone: commerce.timeZone,
  }).format(new Date());

  return (
    <main id="main" className="mx-auto max-w-3xl px-gutter pb-section">
      <header className="py-6">
        <Link href="/" className="inline-flex min-h-11 items-center">
          <Wordmark className="text-headline" />
        </Link>
      </header>

      <h1 className="mt-10 text-display-md font-semibold">{t('title')}</h1>
      <p className="mt-3 text-body-lg text-ink-secondary">{t('lede')}</p>

      <p
        role="status"
        className={cn(
          'mt-10 rounded-card px-5 py-4 text-headline font-medium',
          status.overall === 'ready' && 'bg-success/10 text-success-ink',
          status.overall === 'degraded' && 'bg-warning/12 text-warning-ink',
          status.overall === 'unavailable' && 'bg-danger/10 text-danger-ink',
        )}
      >
        {t(`overall.${status.overall}`)}
      </p>

      <ul className="mt-6 divide-y divide-hairline rounded-card bg-surface ring-1 ring-hairline">
        {status.rows.map((row) => {
          const { icon: Icon, className } = stateStyle[row.state];
          return (
            <li key={row.key} className="flex items-start gap-4 px-5 py-4">
              <Icon
                aria-hidden="true"
                strokeWidth={1.5}
                className={cn('mt-0.5 size-5 shrink-0', className)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h2 className="font-medium">{t(`services.${row.key}`)}</h2>
                  <p className={cn('tabular text-caption', className)}>
                    {t(`state.${row.state}`)}
                    {row.latencyMs !== null ? (
                      <span className="text-ink-secondary">
                        {' '}
                        · {t('latency', { ms: row.latencyMs })}
                      </span>
                    ) : null}
                  </p>
                </div>
                {row.hint ? (
                  <p className="mt-1 text-caption text-ink-secondary">{t(row.hint)}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <ul className="tabular mt-6 flex flex-wrap gap-x-6 gap-y-1 text-caption text-ink-secondary">
        {status.apiVersion ? <li>{t('version', { version: status.apiVersion })}</li> : null}
        <li>{t('requestId', { id: readiness.requestId })}</li>
        <li>{t('checkedAt', { time: checkedAt })}</li>
      </ul>
    </main>
  );
}
