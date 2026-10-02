'use client';

import { TINT_INTENSITY } from '@optical/shared/lens/engine';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { formatPrice } from '@/lib/format';
import { OptionCard } from './option-card';
import { RecommendButton } from './recommend-button';
import type { StepProps } from './step-props';

/** A lens filled with the chosen tint, for a feel of the colour and strength. */
function TintPreview({
  hex,
  intensity,
  kind,
}: {
  hex: string | null;
  intensity: number;
  kind: string;
}) {
  const t = useTranslations('configurator.tint');
  const lens = (fill: string | null, opacity: number, gradient: boolean, label: string) => {
    const gradientId = `tint-gradient-${label.replace(/\W/g, '')}`;
    return (
      <figure className="flex flex-col items-center gap-2">
        <svg viewBox="0 0 120 90" className="h-20 w-28" aria-hidden="true">
          {gradient && fill ? (
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={fill} stopOpacity={opacity} />
                <stop offset="1" stopColor={fill} stopOpacity={0.05} />
              </linearGradient>
            </defs>
          ) : null}
          <rect x="34" y="30" width="52" height="30" rx="3" className="fill-warning-ink/40" />
          <rect
            x="6"
            y="6"
            width="108"
            height="78"
            rx="36"
            fill={fill ? (gradient ? `url(#${gradientId})` : fill) : 'transparent'}
            fillOpacity={gradient ? 1 : opacity}
            className="stroke-ink-secondary"
            strokeWidth={2}
          />
        </svg>
        <figcaption className="text-caption text-ink-secondary">{label}</figcaption>
      </figure>
    );
  };
  if (kind === 'photochromic')
    return (
      <div className="flex justify-center gap-6 rounded-card bg-surface-muted p-4">
        {lens(null, 0, false, t('indoors'))}
        {lens(hex, 0.75, false, t('outdoors'))}
      </div>
    );
  return (
    <div className="flex justify-center rounded-card bg-surface-muted p-4">
      {lens(hex, kind === 'clear' ? 0 : intensity / 100, kind === 'gradient', t('preview'))}
    </div>
  );
}

export function TintStep({ catalog, draft, evaluation, update }: StepProps) {
  const t = useTranslations('configurator.tint');
  const id = useId();
  const selected = catalog.tints.find((option) => option.code === draft.tint?.code);
  const colour = selected?.colours.find((option) => option.code === draft.tint?.colourCode);
  const intensity = draft.tint?.intensity ?? TINT_INTENSITY.default;
  const purpose = catalog.purposes.find((option) => option.code === draft.purpose);

  return (
    <div className="space-y-5">
      <TintPreview
        hex={colour?.hex ?? null}
        intensity={intensity}
        kind={selected?.kind ?? 'clear'}
      />
      <fieldset className="space-y-3">
        <legend className="sr-only">{t('legend')}</legend>
        {catalog.tints.map((option) => (
          <OptionCard
            key={option.code}
            type="radio"
            name="tint"
            value={option.code}
            checked={draft.tint?.code === option.code}
            onChange={() => {
              update({
                tint: {
                  code: option.code,
                  colourCode: option.colours[0]?.code ?? null,
                  intensity: option.supportsIntensity ? TINT_INTENSITY.default : null,
                },
              });
            }}
            title={option.name}
            description={option.description}
            price={option.priceMinor === 0 ? t('included') : `+${formatPrice(option.priceMinor)}`}
            disabledReason={evaluation.availability.tints[option.code]?.reason ?? null}
          >
            {option.colours.length > 0 ? (
              <fieldset>
                <legend className="text-caption font-medium">{t('colour')}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {option.colours.map((swatch) => (
                    <label
                      key={swatch.code}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill py-1 pr-3 pl-1 ring-1 ring-hairline ring-inset has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
                    >
                      <input
                        type="radio"
                        name={`${id}-colour`}
                        className="sr-only"
                        checked={draft.tint?.colourCode === swatch.code}
                        onChange={() => {
                          update({
                            tint: {
                              code: option.code,
                              colourCode: swatch.code,
                              intensity: draft.tint?.intensity ?? null,
                            },
                          });
                        }}
                      />
                      <span
                        className="size-8 rounded-pill ring-1 ring-black/10"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      <span className="text-caption">{swatch.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {option.supportsIntensity ? (
              <div className="mt-3">
                <label htmlFor={`${id}-intensity`} className="text-caption font-medium">
                  {t('strength')} <span className="tabular text-ink-secondary">{intensity}%</span>
                </label>
                <input
                  id={`${id}-intensity`}
                  type="range"
                  min={TINT_INTENSITY.min}
                  max={TINT_INTENSITY.max}
                  step={10}
                  value={intensity}
                  aria-valuetext={`${intensity}%`}
                  onChange={(event) => {
                    update({
                      tint: {
                        code: option.code,
                        colourCode: draft.tint?.colourCode ?? null,
                        intensity: Number(event.target.value),
                      },
                    });
                  }}
                  className="mt-1 w-full accent-[var(--color-accent)]"
                />
              </div>
            ) : null}
          </OptionCard>
        ))}
      </fieldset>
      <RecommendButton
        onClick={() => {
          const code =
            purpose?.code === 'sun-rx' ? 'polarised' : (purpose?.defaultTintCode ?? 'clear');
          const tint = catalog.tints.find((option) => option.code === code);
          if (tint)
            update({
              tint: {
                code: tint.code,
                colourCode: tint.colours[0]?.code ?? null,
                intensity: tint.supportsIntensity ? TINT_INTENSITY.default : null,
              },
            });
        }}
      />
    </div>
  );
}
