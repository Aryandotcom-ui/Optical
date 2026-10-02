'use client';

import type { LensPurpose } from '@optical/shared/lens';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatPrice } from '@/lib/format';
import { OptionCard } from './option-card';
import { RecommendButton } from './recommend-button';
import type { StepProps } from './step-props';

/** Picks a lens type from two plain questions. */
function suggestPurpose(
  hasPrescription: boolean,
  needsReading: boolean,
  sunglasses: boolean,
): LensPurpose {
  if (!hasPrescription) return 'zero-power';
  if (needsReading) return 'progressive';
  return sunglasses ? 'sun-rx' : 'single-vision';
}

export function PurposeStep({
  catalog,
  draft,
  evaluation,
  update,
  sunglasses,
}: StepProps & { sunglasses: boolean }) {
  const t = useTranslations('configurator.purpose');
  const [helping, setHelping] = useState(false);
  const [hasPrescription, setHasPrescription] = useState<boolean | null>(null);
  const [needsReading, setNeedsReading] = useState<boolean | null>(null);

  const choose = (code: LensPurpose) => {
    const purpose = catalog.purposes.find((option) => option.code === code);
    const tint = catalog.tints.find((option) => option.code === purpose?.defaultTintCode);
    update({
      purpose: code,
      indexCode: null,
      tint: tint
        ? { code: tint.code, colourCode: tint.colours[0]?.code ?? null, intensity: null }
        : null,
    });
  };

  const question = (
    legend: string,
    value: boolean | null,
    set: (value: boolean) => void,
    name: string,
  ) => (
    <fieldset className="mt-4">
      <legend className="text-caption font-medium">{legend}</legend>
      <div className="mt-2 flex gap-2">
        {[true, false].map((answer) => (
          <label
            key={String(answer)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill px-4 ring-1 ring-hairline ring-inset has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === answer}
              onChange={() => {
                set(answer);
              }}
            />
            {answer ? t('yes') : t('no')}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-3">
      <fieldset className="space-y-3">
        <legend className="sr-only">{t('legend')}</legend>
        {catalog.purposes.map((purpose) => (
          <OptionCard
            key={purpose.code}
            type="radio"
            name="purpose"
            value={purpose.code}
            checked={draft.purpose === purpose.code}
            onChange={() => {
              choose(purpose.code);
            }}
            title={purpose.name}
            description={purpose.description}
            price={
              purpose.basePriceMinor === 0
                ? t('included')
                : t('from', { price: formatPrice(purpose.basePriceMinor) })
            }
            disabledReason={evaluation.availability.purposes[purpose.code]?.reason ?? null}
          />
        ))}
      </fieldset>

      <div className="rounded-card bg-surface-muted p-4">
        {helping ? (
          <div>
            <p className="font-medium">{t('helpTitle')}</p>
            {question(t('hasPrescription'), hasPrescription, setHasPrescription, 'help-rx')}
            {hasPrescription
              ? question(t('needsReading'), needsReading, setNeedsReading, 'help-reading')
              : null}
            {hasPrescription === false || (hasPrescription && needsReading !== null) ? (
              <RecommendButton
                label={t('useSuggestion')}
                onClick={() => {
                  choose(suggestPurpose(hasPrescription, needsReading === true, sunglasses));
                }}
              />
            ) : null}
          </div>
        ) : (
          <RecommendButton
            onClick={() => {
              setHelping(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
