'use client';

import { commerce, isValidPostalCode } from '@optical/config/commerce';
import { Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useId, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/format';
import { createLocalValue } from '@/lib/local-value';

const DeliveryWindows = dynamic(() =>
  import('./delivery-windows').then((module) => module.DeliveryWindows),
);

/** The last PIN checked, remembered in this browser only. */
const savedPin = createLocalValue<string>(
  'delivery-pin',
  (raw) => (typeof raw === 'string' && isValidPostalCode(raw) ? raw : null),
  '',
);

/**
 * Delivery window for a PIN code, worked out in the browser from the same
 * rules checkout uses. Nothing is sent anywhere; the PIN is remembered only
 * in this browser for next time.
 */
export function DeliveryEstimate({
  freeShippingThresholdMinor,
}: {
  freeShippingThresholdMinor: number;
}) {
  const t = useTranslations('pdp.delivery');
  const id = useId();
  const saved = savedPin.useValue();
  // What the person is typing; until they type, the input shows the saved PIN.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const pin = draft ?? saved;
  const checked = error || (draft !== null && draft !== saved) ? null : saved || null;

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = pin.trim();
    if (!isValidPostalCode(value)) {
      setError(true);
      return;
    }
    setError(false);
    savedPin.set(value);
    setDraft(null);
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-card bg-surface-muted p-5">
      <h2 id={`${id}-heading`} className="flex items-center gap-2 font-medium">
        <Truck aria-hidden="true" className="size-5" strokeWidth={1.5} />
        {t('title')}
      </h2>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2" noValidate>
        <label htmlFor={`${id}-pin`} className="sr-only">
          {t('label', { label: commerce.postalCode.label })}
        </label>
        <input
          id={`${id}-pin`}
          value={pin}
          onChange={(event) => {
            setDraft(event.target.value.replace(/\D/g, '').slice(0, 6));
            setError(false);
          }}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder={t('placeholder', {
            label: commerce.postalCode.label,
            example: commerce.postalCode.example,
          })}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="tabular min-h-11 min-w-0 flex-1 rounded-pill bg-surface px-4 ring-1 ring-hairline ring-inset placeholder:text-ink-secondary focus:ring-2 focus:ring-accent focus:outline-none aria-invalid:ring-danger"
        />
        <Button type="submit" variant="secondary">
          {t('check')}
        </Button>
      </form>
      <div aria-live="polite" className="mt-3 text-caption">
        {error ? (
          <p id={`${id}-error`} className="text-danger-ink">
            {t('invalid', { label: commerce.postalCode.label })}
          </p>
        ) : null}
        {checked ? (
          <DeliveryWindows pin={checked} />
        ) : !error ? (
          <p className="text-ink-secondary">
            {t('hint', { amount: formatPrice(freeShippingThresholdMinor) })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
