'use client';

import { commerce } from '@optical/config/commerce';
import { extractInclusiveTax } from '@optical/shared/money';
import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/format';
import type { StepProps } from './step-props';

/** The full summary: every line, the tax inside the price, and when to expect it. */
export function ReviewStep({
  draft,
  evaluation,
  frameName,
  framePriceMinor,
}: StepProps & { frameName: string; framePriceMinor: number }) {
  const t = useTranslations('configurator.review');
  const quote = evaluation.quote;
  if (!quote?.ok)
    return (
      <div aria-live="polite" className="space-y-2">
        <p className="font-medium">{t('needsAttention')}</p>
        <ul className="list-disc space-y-1 pl-5 text-caption text-danger-ink">
          {quote ? quote.errors.map((error) => <li key={error.path}>{error.message}</li>) : null}
        </ul>
      </div>
    );
  const total = framePriceMinor + quote.totalMinor;
  // Tax is taken out of each line and then added up, exactly as checkout does.
  const tax = [framePriceMinor, ...quote.lines.map((line) => line.priceMinor)].reduce(
    (sum, amount) => sum + extractInclusiveTax(amount, commerce.tax.rateBasisPoints).tax,
    0,
  );
  const rxNote =
    draft.rxMode === 'later'
      ? t('rxLater')
      : draft.rxMode === 'upload'
        ? t('rxUpload')
        : t('rxManual');
  const needsRx = draft.purpose !== 'zero-power' && draft.purpose !== 'computer';
  return (
    <div className="space-y-5">
      <dl className="divide-y divide-hairline rounded-card bg-surface-muted px-4">
        <div className="flex justify-between gap-4 py-3">
          <dt>{frameName}</dt>
          <dd className="tabular">{formatPrice(framePriceMinor)}</dd>
        </div>
        {quote.lines.map((line) => (
          <div key={`${line.kind}-${line.code}`} className="flex justify-between gap-4 py-3">
            <dt>{line.label}</dt>
            <dd className="tabular">
              {line.priceMinor === 0 ? t('included') : formatPrice(line.priceMinor)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-3 font-semibold">
          <dt>{t('total')}</dt>
          <dd className="tabular">{formatPrice(total)}</dd>
        </div>
      </dl>
      <p className="text-caption text-ink-secondary">
        {t('tax', { tax: commerce.tax.name, amount: formatPrice(tax) })}
      </p>
      {quote.warnings.length > 0 ? (
        <ul className="space-y-1 text-caption text-warning-ink">
          {quote.warnings.map((warning) => (
            <li key={warning.message}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
      {needsRx ? <p className="text-caption text-ink-secondary">{rxNote}</p> : null}
      <p className="text-caption text-ink-secondary">
        {t('delivery', {
          days: needsRx
            ? commerce.policies.dispatchDaysPrescription
            : commerce.policies.dispatchDaysFrameOnly,
        })}
      </p>
    </div>
  );
}
