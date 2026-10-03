'use client';

import type { PaymentOption, PaymentProviderCode } from '@optical/shared/checkout';
import { useTranslations } from 'next-intl';
import { OptionCard } from '@/components/configurator/option-card';
import { formatPrice } from '@/lib/format';

/** Payment methods this shop offers right now, with the reason any can't be used. */
export function PaymentOptions({
  options,
  value,
  onChange,
}: {
  options: PaymentOption[];
  value: PaymentProviderCode | null;
  onChange: (provider: PaymentProviderCode) => void;
}) {
  const t = useTranslations('checkout.payment');
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{t('legend')}</legend>
      {options.map((option) => (
        <OptionCard
          key={option.provider}
          type="radio"
          name="payment"
          value={option.provider}
          checked={value === option.provider}
          onChange={() => {
            onChange(option.provider);
          }}
          title={t(`${option.provider}.title`)}
          description={t(`${option.provider}.description`)}
          price={option.feeMinor > 0 ? `+${formatPrice(option.feeMinor)}` : undefined}
          disabledReason={option.available ? null : option.reason}
        />
      ))}
    </fieldset>
  );
}
