'use client';

import { useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/format';
import { Badge, OptionCard } from './option-card';
import { RecommendButton } from './recommend-button';
import type { StepProps } from './step-props';

/** The same window seen through a bare lens and an anti-reflective one. */
function GlareComparison({ coated }: { coated: boolean }) {
  const t = useTranslations('configurator.coatings');
  const lens = (withCoating: boolean, label: string) => (
    <figure className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 90" className="h-20 w-28" aria-hidden="true">
        <rect
          x="6"
          y="6"
          width="108"
          height="78"
          rx="36"
          className="fill-surface stroke-ink-secondary"
          strokeWidth={2}
        />
        <rect x="34" y="26" width="52" height="38" rx="4" className="fill-accent/20" />
        {withCoating ? null : (
          <g className="fill-white/90">
            <path d="M18 70 L52 14 L64 14 L30 70 Z" />
            <path d="M70 76 L96 30 L102 30 L76 76 Z" />
          </g>
        )}
      </svg>
      <figcaption className="text-caption text-ink-secondary">{label}</figcaption>
    </figure>
  );
  return (
    <div
      className="flex justify-center gap-6 rounded-card bg-surface-muted p-4"
      role="img"
      aria-label={t('glareAlt')}
    >
      {lens(false, t('without'))}
      {lens(true, coated ? t('withYours') : t('with'))}
    </div>
  );
}

export function CoatingsStep({ catalog, draft, evaluation, update }: StepProps) {
  const t = useTranslations('configurator.coatings');
  const purpose = catalog.purposes.find((option) => option.code === draft.purpose);
  const packageOption = catalog.packages.find((option) => option.code === draft.packageCode);
  const included = new Set([
    ...(purpose?.includedCoatingCodes ?? []),
    ...(packageOption?.coatingCodes ?? []),
  ]);
  const extras = catalog.coatings.filter((coating) => !included.has(coating.code));
  const antiReflective =
    included.has('anti-reflective') || draft.extraCoatingCodes.includes('anti-reflective');

  return (
    <div className="space-y-5">
      <GlareComparison coated={antiReflective} />
      <fieldset className="space-y-3">
        <legend className="font-medium">{t('packages')}</legend>
        <OptionCard
          type="radio"
          name="package"
          value="none"
          checked={draft.packageCode === null}
          onChange={() => {
            update({ packageCode: null });
          }}
          title={t('none')}
          description={t('noneDescription')}
          price={t('included')}
        />
        {catalog.packages.map((option) => (
          <OptionCard
            key={option.code}
            type="radio"
            name="package"
            value={option.code}
            checked={draft.packageCode === option.code}
            onChange={() => {
              update({
                packageCode: option.code,
                extraCoatingCodes: draft.extraCoatingCodes.filter(
                  (code) => !option.coatingCodes.includes(code),
                ),
              });
            }}
            title={option.name}
            badge={option.code === 'complete' ? <Badge>{t('popular')}</Badge> : null}
            description={option.description}
            price={`+${formatPrice(option.priceMinor)}`}
            disabledReason={evaluation.availability.packages[option.code]?.reason ?? null}
          />
        ))}
      </fieldset>

      {included.size > 0 ? (
        <p className="text-caption text-ink-secondary">
          {t('includedList', {
            list: catalog.coatings
              .filter((coating) => included.has(coating.code))
              .map((coating) => coating.name)
              .join(', '),
          })}
        </p>
      ) : null}

      {extras.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">{t('extras')}</legend>
          {extras.map((coating) => (
            <OptionCard
              key={coating.code}
              type="checkbox"
              name="coating"
              value={coating.code}
              checked={draft.extraCoatingCodes.includes(coating.code)}
              onChange={(checked) => {
                update({
                  extraCoatingCodes: checked
                    ? [...draft.extraCoatingCodes, coating.code]
                    : draft.extraCoatingCodes.filter((code) => code !== coating.code),
                });
              }}
              title={coating.name}
              description={coating.benefit}
              price={`+${formatPrice(coating.priceMinor)}`}
              disabledReason={evaluation.availability.coatings[coating.code]?.reason ?? null}
            />
          ))}
        </fieldset>
      ) : null}
      <RecommendButton
        onClick={() => {
          update({ packageCode: 'complete', extraCoatingCodes: [] });
        }}
      />
    </div>
  );
}
