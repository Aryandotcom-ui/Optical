'use client';

import {
  estimateLensThickness,
  recommendIndex,
  type ThicknessEstimate,
} from '@optical/shared/lens/engine';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { formatPrice } from '@/lib/format';
import { Badge, OptionCard } from './option-card';
import { RecommendButton } from './recommend-button';
import type { StepProps } from './step-props';

/** Shown when the prescription isn't typed in, clearly labelled as an example. */
const EXAMPLE_POWER = -3;
const MM_TO_PX = 9;

/** A lens cut through the middle: thick edges for minus powers, a thick centre for plus. */
function CrossSection({ estimate }: { estimate: ThicknessEstimate }) {
  const centre = Math.min(estimate.centreMm, 11) * MM_TO_PX;
  const edge = Math.min(estimate.edgeMm, 11) * MM_TO_PX;
  const mid = 60;
  // Quadratic curve through the centre point: control = 2·centre − average(ends).
  const top = 2 * (mid - centre / 2) - (mid - edge / 2);
  const bottom = 2 * (mid + centre / 2) - (mid + edge / 2);
  const d = `M20 ${mid - edge / 2} Q140 ${top} 260 ${mid - edge / 2} L260 ${mid + edge / 2} Q140 ${bottom} 20 ${mid + edge / 2} Z`;
  return (
    <svg viewBox="0 0 280 120" className="h-28 w-full" aria-hidden="true">
      <path
        d={d}
        className="fill-accent/15 stroke-accent transition-[d] duration-300 ease-standard motion-reduce:transition-none"
        strokeWidth={1.5}
      />
      <line x1="140" x2="140" y1="8" y2="112" className="stroke-hairline" strokeDasharray="3 3" />
    </svg>
  );
}

export function ThicknessStep({ catalog, draft, evaluation, frame, update }: StepProps) {
  const t = useTranslations('configurator.thickness');
  const id = useId();
  const power = evaluation.signedPower ?? EXAMPLE_POWER;
  const indexes = [...catalog.indexes].sort((a, b) => a.refractiveIndex - b.refractiveIndex);
  const available = indexes.filter(
    (option) => evaluation.availability.indexes[option.code]?.available !== false,
  );
  const estimates = new Map(
    indexes.map((option) => [
      option.code,
      estimateLensThickness({
        power,
        refractiveIndex: option.refractiveIndex,
        lensWidthMm: frame.lensWidthMm,
      }),
    ]),
  );
  const recommendation = draft.purpose
    ? recommendIndex(
        catalog,
        {
          purpose: draft.purpose,
          frame,
          strongestPower: evaluation.signedPower === null ? null : Math.abs(evaluation.signedPower),
          selected: [],
        },
        frame.lensWidthMm,
      )
    : null;
  const current = available.find((option) => option.code === draft.indexCode) ?? available[0];
  const currentEstimate = current ? estimates.get(current.code) : undefined;
  const position = current ? available.indexOf(current) : 0;
  const thickness = (estimate: ThicknessEstimate | undefined) =>
    estimate ? t('thickest', { mm: estimate.maxMm.toFixed(1) }) : '';

  return (
    <div className="space-y-5">
      <div className="rounded-card bg-surface-muted p-4">
        <p className="text-caption text-ink-secondary">
          {evaluation.signedPower === null ? t('example', { power: '−3.00' }) : t('yours')}
        </p>
        {currentEstimate ? <CrossSection estimate={currentEstimate} /> : null}
        <label htmlFor={`${id}-slider`} className="sr-only">
          {t('slider')}
        </label>
        <input
          id={`${id}-slider`}
          type="range"
          min={0}
          max={Math.max(0, available.length - 1)}
          step={1}
          value={position}
          aria-valuetext={current ? `${current.name}, ${thickness(currentEstimate)}` : undefined}
          onChange={(event) => {
            const next = available[Number(event.target.value)];
            if (next) update({ indexCode: next.code });
          }}
          className="w-full accent-[var(--color-accent)]"
        />
        <div className="flex justify-between text-caption text-ink-secondary">
          <span>{t('thicker')}</span>
          <span className="tabular font-medium text-ink">{thickness(currentEstimate)}</span>
          <span>{t('thinner')}</span>
        </div>
        <p className="mt-2 text-caption text-ink-secondary">{t('estimateNote')}</p>
      </div>

      <fieldset className="space-y-3">
        <legend className="sr-only">{t('legend')}</legend>
        {indexes.map((option) => (
          <OptionCard
            key={option.code}
            type="radio"
            name="index"
            value={option.code}
            checked={draft.indexCode === option.code}
            onChange={() => {
              update({ indexCode: option.code });
            }}
            title={option.name}
            badge={
              recommendation?.indexCode === option.code ? <Badge>{t('recommended')}</Badge> : null
            }
            description={
              <>
                {option.description}{' '}
                <span className="tabular">{thickness(estimates.get(option.code))}.</span>
              </>
            }
            price={option.priceMinor === 0 ? t('included') : `+${formatPrice(option.priceMinor)}`}
            disabledReason={evaluation.availability.indexes[option.code]?.reason ?? null}
          />
        ))}
      </fieldset>
      {recommendation ? (
        <div className="space-y-1">
          <RecommendButton
            onClick={() => {
              update({ indexCode: recommendation.indexCode });
            }}
          />
          <p className="text-caption text-ink-secondary">{recommendation.reason}</p>
        </div>
      ) : null}
    </div>
  );
}
