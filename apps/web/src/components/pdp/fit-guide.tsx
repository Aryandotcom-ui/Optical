'use client';

import type { FrameSpec } from '@optical/shared/catalog';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { formatMm } from '@/lib/format';
import { createLocalValue } from '@/lib/local-value';
import { estimatedTotalWidth, FitDiagram, type FrameSize } from './fit-diagram';

const LIMITS = { lensWidthMm: [38, 65], bridgeMm: [12, 26], templeMm: [115, 155] } as const;
type Field = keyof typeof LIMITS;

interface YourSize {
  lensWidthMm: string;
  bridgeMm: string;
  templeMm: string;
}

const EMPTY: YourSize = { lensWidthMm: '', bridgeMm: '', templeMm: '' };

/** The customer's own frame size, remembered in this browser for every product page. */
const savedSize = createLocalValue<YourSize>(
  'my-frame-size',
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    const record = raw as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 5) : '');
    return {
      lensWidthMm: text(record.lensWidthMm),
      bridgeMm: text(record.bridgeMm),
      templeMm: text(record.templeMm),
    };
  },
  EMPTY,
);

const FIELDS = Object.keys(LIMITS) as Field[];

/** The three numbers as millimetres, or null until all are filled in and plausible. */
function parseSize(input: YourSize): Record<Field, number> | null {
  const result: Record<Field, number> = { lensWidthMm: 0, bridgeMm: 0, templeMm: 0 };
  for (const field of FIELDS) {
    const value = Number(input[field]);
    const [min, max] = LIMITS[field];
    if (!input[field] || !Number.isFinite(value) || value < min || value > max) return null;
    result[field] = value;
  }
  return result;
}

/** How a difference in millimetres feels in practice. */
function verdictFor(
  totalDiff: number,
): 'same' | 'slightlyWider' | 'slightlyNarrower' | 'wider' | 'narrower' {
  if (Math.abs(totalDiff) <= 3) return 'same';
  if (totalDiff > 0) return totalDiff <= 7 ? 'slightlyWider' : 'wider';
  return totalDiff >= -7 ? 'slightlyNarrower' : 'narrower';
}

/**
 * Measurements, a to-scale drawing and a comparison with a pair the customer
 * already owns, using the three numbers printed inside its arm.
 */
export function FitGuide({ frame }: { frame: FrameSpec }) {
  const t = useTranslations('pdp.fit');
  const tShape = useTranslations('filters.shapeValues');
  const tMaterial = useTranslations('filters.materialValues');
  const id = useId();
  const yours = savedSize.useValue();
  const update = (field: Field, value: string) => {
    savedSize.set({ ...yours, [field]: value.replace(/[^\d.]/g, '').slice(0, 5) });
  };

  const parsed = parseSize(yours);
  const compare: FrameSize | null = parsed
    ? {
        lensWidthMm: parsed.lensWidthMm,
        bridgeMm: parsed.bridgeMm,
        lensHeightMm: frame.lensHeightMm,
      }
    : null;
  const totalDiff = parsed ? Math.round(frame.totalWidthMm - estimatedTotalWidth(parsed)) : 0;
  const signed = (value: number) =>
    value > 0 ? `+${formatMm(value)}` : value < 0 ? `−${formatMm(-value)}` : t('same');

  const rows: [string, string][] = [
    [t('lensWidth'), formatMm(frame.lensWidthMm)],
    [t('bridge'), formatMm(frame.bridgeMm)],
    [t('temple'), formatMm(frame.templeMm)],
    [t('lensHeight'), formatMm(frame.lensHeightMm)],
    [t('totalWidth'), formatMm(frame.totalWidthMm)],
    [t('weight'), t('grams', { value: frame.weightG })],
    [t('shape'), tShape(frame.shape)],
    [t('material'), tMaterial(frame.material)],
    [t('rim'), t(`rimValues.${frame.rimType}`)],
    [t('hinge'), t(`hingeValues.${frame.hinge}`)],
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <FitDiagram
          shape={frame.shape}
          size={frame}
          totalWidthMm={frame.totalWidthMm}
          compare={compare}
          labels={{
            title: t('diagramLabel', { total: frame.totalWidthMm }),
            lens: formatMm(frame.lensWidthMm),
            bridge: formatMm(frame.bridgeMm),
            total: formatMm(frame.totalWidthMm),
            card: t('card'),
            yours: t('yoursLegend'),
          }}
        />
        <p className="mt-3 text-caption text-ink-secondary">{t('diagramNote')}</p>
      </div>

      <div className="space-y-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-caption">
          {rows.map(([label, value]) => (
            <div key={label} className="border-b border-hairline pb-2">
              <dt className="text-ink-secondary">{label}</dt>
              <dd className="tabular mt-0.5 text-body font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <form
          className="rounded-card bg-surface-muted p-5"
          aria-labelledby={`${id}-compare`}
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <h3 id={`${id}-compare`} className="font-medium">
            {t('compareTitle')}
          </h3>
          <p className="mt-1 text-caption text-ink-secondary">{t('compareHint')}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {FIELDS.map((field) => (
              <label key={field} className="text-caption text-ink-secondary">
                {t(`yours.${field}`)}
                <input
                  value={yours[field]}
                  onChange={(event) => {
                    update(field, event.target.value);
                  }}
                  inputMode="decimal"
                  placeholder={String(
                    LIMITS[field][0] + Math.round((LIMITS[field][1] - LIMITS[field][0]) / 2),
                  )}
                  className="tabular mt-1 block min-h-11 w-full rounded-control bg-surface px-3 text-body text-ink ring-1 ring-hairline ring-inset placeholder:text-ink-secondary/70 focus:ring-2 focus:ring-accent focus:outline-none"
                />
              </label>
            ))}
          </div>
          <div aria-live="polite" className="mt-4 text-caption">
            {parsed ? (
              <>
                <p className="font-medium text-ink">
                  {t(`verdict.${verdictFor(totalDiff)}`, { diff: formatMm(Math.abs(totalDiff)) })}
                </p>
                <ul className="mt-2 space-y-1 text-ink-secondary">
                  <li>{t('diffLens', { diff: signed(frame.lensWidthMm - parsed.lensWidthMm) })}</li>
                  <li>{t('diffBridge', { diff: signed(frame.bridgeMm - parsed.bridgeMm) })}</li>
                  <li>{t('diffTemple', { diff: signed(frame.templeMm - parsed.templeMm) })}</li>
                </ul>
              </>
            ) : yours.lensWidthMm || yours.bridgeMm || yours.templeMm ? (
              <p className="text-ink-secondary">{t('compareIncomplete')}</p>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
