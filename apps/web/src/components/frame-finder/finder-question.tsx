import { colourFamilies, faceShapes, frameMaterials } from '@optical/shared/catalog';
import {
  finderBudgets,
  finderUses,
  finderVibes,
  type FinderAnswers,
} from '@optical/shared/frame-finder';
import type { Route } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { colourSwatch } from '@/lib/colour-swatches';
import { cn } from '@/lib/cn';
import {
  FINDER_STEPS,
  finderEntries,
  finderHref,
  withoutStep,
  type FinderStep,
} from '@/lib/finder-params';
import { formatPrice } from '@/lib/format';
import { FaceDetectLauncher } from './face-detect-launcher';
import { FaceShapeFigure } from './face-shape-figure';

const optionCard =
  'duration-micro flex cursor-pointer gap-3 rounded-card bg-surface p-4 ring-1 ring-hairline transition-shadow ease-standard ring-inset hover:ring-ink-secondary has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent';
const chip =
  'duration-micro inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill bg-surface px-4 ring-1 ring-hairline transition-colors ease-standard ring-inset hover:ring-ink-secondary has-[:checked]:bg-ink has-[:checked]:text-background has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent';

function Choice({
  type,
  name,
  value,
  checked,
  className,
  children,
}: {
  type: 'radio' | 'checkbox';
  name: string;
  value: string;
  checked: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <input type={type} name={name} value={value} defaultChecked={checked} className="sr-only" />
      {children}
    </label>
  );
}

/**
 * One Frame Finder question as a plain GET form: the answers so far ride
 * along as hidden fields, so the URL always holds the whole state (back,
 * reload and sharing all work, with or without JavaScript).
 */
export async function FinderQuestion({ answers, step }: { answers: FinderAnswers; step: number }) {
  const t = await getTranslations('frameFinder');
  const tFilters = await getTranslations('filters');
  const key: FinderStep = FINDER_STEPS[step] ?? 'face';
  const last = step === FINDER_STEPS.length - 1;
  const others = finderEntries(withoutStep(answers, key));
  if (key === 'face' && answers.faceWidthMm !== null)
    others.push(['width', String(answers.faceWidthMm)]);
  const skipHref = (
    last
      ? finderHref(withoutStep(answers, key))
      : finderHref(withoutStep(answers, key), { step: step + 1 })
  ) as Route;
  const titleId = `finder-${key}-title`;
  const hasHint = key !== 'use';

  return (
    <section aria-labelledby={titleId} className="space-y-6">
      <div>
        <p className="text-caption text-ink-secondary">
          {t('progress', { step: step + 1, total: FINDER_STEPS.length })}
        </p>
        <div aria-hidden="true" className="mt-2 grid grid-cols-5 gap-1.5">
          {FINDER_STEPS.map((entry, index) => (
            <span
              key={entry}
              className={cn('h-1 rounded-pill', index <= step ? 'bg-ink' : 'bg-hairline')}
            />
          ))}
        </div>
        <h2 id={titleId} className="mt-6 text-title font-semibold">
          {t(`steps.${key}.title`)}
        </h2>
        {hasHint ? <p className="mt-1 text-ink-secondary">{t(`steps.${key}.hint`)}</p> : null}
      </div>

      <Form action="/frame-finder" scroll={false} className="space-y-6">
        {others.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {last ? (
          <input type="hidden" name="view" value="results" />
        ) : (
          <input type="hidden" name="step" value={step + 2} />
        )}

        {key === 'face' ? (
          <fieldset aria-labelledby={titleId}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {faceShapes.map((shape) => (
                <Choice
                  key={shape}
                  type="radio"
                  name="face"
                  value={shape}
                  checked={answers.faceShape === shape}
                  className={cn(optionCard, 'flex-col items-center text-center')}
                >
                  <FaceShapeFigure shape={shape} className="h-24 w-auto text-ink" />
                  <span className="font-medium">{t(`faceShapes.${shape}`)}</span>
                  <span className="text-caption text-ink-secondary">
                    {t(`faceShapeHints.${shape}`)}
                  </span>
                </Choice>
              ))}
            </div>
          </fieldset>
        ) : null}

        {key === 'face' ? <FaceDetectLauncher answers={answers} /> : null}

        {key === 'vibe' ? (
          <fieldset aria-labelledby={titleId} className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(finderVibes) as (keyof typeof finderVibes)[]).map((vibe) => (
              <Choice
                key={vibe}
                type="checkbox"
                name="vibe"
                value={vibe}
                checked={answers.vibes.includes(vibe)}
                className={cn(optionCard, 'flex-col')}
              >
                <span className="font-medium">{t(`vibes.${vibe}`)}</span>
                <span className="text-caption text-ink-secondary">{t(`vibeHints.${vibe}`)}</span>
              </Choice>
            ))}
          </fieldset>
        ) : null}

        {key === 'use' ? (
          <fieldset aria-labelledby={titleId} className="grid gap-3 sm:grid-cols-2">
            {finderUses.map((use) => (
              <Choice
                key={use}
                type="radio"
                name="use"
                value={use}
                checked={answers.use === use}
                className={optionCard}
              >
                <span className="font-medium">{t(`uses.${use}`)}</span>
              </Choice>
            ))}
          </fieldset>
        ) : null}

        {key === 'budget' ? (
          <fieldset aria-labelledby={titleId} className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(finderBudgets) as (keyof typeof finderBudgets)[]).map((budget) => {
              const band = finderBudgets[budget];
              return (
                <Choice
                  key={budget}
                  type="radio"
                  name="budget"
                  value={budget}
                  checked={answers.budget === budget}
                  className={optionCard}
                >
                  <span className="font-medium">
                    {t(`budgets.${budget}`, {
                      min: formatPrice(band.minMinor),
                      max: band.maxMinor === null ? '' : formatPrice(band.maxMinor),
                    })}
                  </span>
                </Choice>
              );
            })}
          </fieldset>
        ) : null}

        {key === 'look' ? (
          <div className="space-y-6">
            <fieldset>
              <legend className="font-medium">{tFilters('material')}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {frameMaterials.map((material) => (
                  <Choice
                    key={material}
                    type="checkbox"
                    name="material"
                    value={material}
                    checked={answers.materials.includes(material)}
                    className={chip}
                  >
                    {tFilters(`materialValues.${material}`)}
                  </Choice>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="font-medium">{tFilters('colour')}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {colourFamilies.map((colour) => (
                  <Choice
                    key={colour}
                    type="checkbox"
                    name="colour"
                    value={colour}
                    checked={answers.colours.includes(colour)}
                    className={chip}
                  >
                    <span
                      aria-hidden="true"
                      className="size-4 rounded-pill ring-1 ring-hairline"
                      style={{ background: colourSwatch[colour] }}
                    />
                    {tFilters(`colourValues.${colour}`)}
                  </Choice>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
          {step > 0 ? (
            <Button asChild variant="ghost">
              <Link href={finderHref(answers, { step: step - 1 }) as Route} scroll={false}>
                {t('back')}
              </Link>
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button asChild variant="ghost">
            <Link href={skipHref} scroll={false}>
              {t('skip')}
            </Link>
          </Button>
          <Button type="submit" size="lg">
            {last ? t('showResults') : t('next')}
          </Button>
        </div>
      </Form>
    </section>
  );
}
