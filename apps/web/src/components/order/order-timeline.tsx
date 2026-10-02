'use client';

import type { OrderView } from '@optical/shared/checkout';
import { Check, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatShortDate } from '@/lib/format';

/** What has happened, and what normally comes next. */
export function OrderTimeline({ order }: { order: OrderView }) {
  const t = useTranslations('order');
  return (
    <section aria-labelledby="timeline">
      <h2 id="timeline" className="text-title font-semibold">
        {t('timeline')}
      </h2>
      <ol className="mt-4 space-y-4">
        {order.timeline.map((step, index) => (
          <li key={`${step.status}-${index}`} className="flex gap-3">
            <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-pill bg-ink text-background">
              <Check aria-hidden="true" className="size-3" strokeWidth={2.5} />
            </span>
            <span>
              <span className="block font-medium">{step.label}</span>
              <time dateTime={step.at} className="text-caption text-ink-secondary">
                {formatShortDate(step.at)}
              </time>
            </span>
          </li>
        ))}
        {order.upcoming.map((step) => (
          <li key={step.status} className="flex gap-3 text-ink-secondary">
            <Circle aria-hidden="true" className="mt-0.5 size-5" strokeWidth={1.5} />
            <span>
              {step.label}
              <span className="sr-only">{` (${t('upcoming')})`}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
