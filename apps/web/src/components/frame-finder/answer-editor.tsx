import { colourFamilies, faceShapes, frameMaterials } from '@optical/shared/catalog';
import {
  finderBudgets,
  finderUses,
  finderVibes,
  type FinderAnswers,
} from '@optical/shared/frame-finder';
import { X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Disclosure } from '@/components/ui/disclosure';
import { cn } from '@/lib/cn';
import { colourSwatch } from '@/lib/colour-swatches';
import { finderHref, toggleAnswer, type AnswerField } from '@/lib/finder-params';
import { formatPrice } from '@/lib/format';

const chipClass = (on: boolean) =>
  cn(
    'duration-micro inline-flex min-h-11 items-center gap-2 rounded-pill px-4 ring-1 transition-colors ease-standard ring-inset',
    on
      ? 'bg-ink text-background ring-ink'
      : 'bg-surface text-ink ring-hairline hover:ring-ink-secondary',
  );

interface Option {
  value: string;
  label: string;
  swatch?: string | undefined;
}

/**
 * The answers behind the results, editable in place: a summary of chips
 * that each remove an answer, and every option as a link that switches it.
 * Plain links, so each change is a new URL the back button can undo.
 */
export async function AnswerEditor({ answers }: { answers: FinderAnswers }) {
  const t = await getTranslations('frameFinder');
  const tFilters = await getTranslations('filters');

  const budgetLabel = (budget: keyof typeof finderBudgets) => {
    const band = finderBudgets[budget];
    return t(`budgets.${budget}`, {
      min: formatPrice(band.minMinor),
      max: band.maxMinor === null ? '' : formatPrice(band.maxMinor),
    });
  };

  const groups: { field: AnswerField; title: string; options: Option[] }[] = [
    {
      field: 'faceShape',
      title: t('results.groups.face'),
      options: faceShapes.map((value) => ({ value, label: t(`faceShapes.${value}`) })),
    },
    {
      field: 'vibes',
      title: t('results.groups.vibe'),
      options: (Object.keys(finderVibes) as (keyof typeof finderVibes)[]).map((value) => ({
        value,
        label: t(`vibes.${value}`),
      })),
    },
    {
      field: 'use',
      title: t('results.groups.use'),
      options: finderUses.map((value) => ({ value, label: t(`uses.${value}`) })),
    },
    {
      field: 'budget',
      title: t('results.groups.budget'),
      options: (Object.keys(finderBudgets) as (keyof typeof finderBudgets)[]).map((value) => ({
        value,
        label: budgetLabel(value),
      })),
    },
    {
      field: 'materials',
      title: tFilters('material'),
      options: frameMaterials.map((value) => ({
        value,
        label: tFilters(`materialValues.${value}`),
      })),
    },
    {
      field: 'colours',
      title: tFilters('colour'),
      options: colourFamilies.map((value) => ({
        value,
        label: tFilters(`colourValues.${value}`),
        swatch: colourSwatch[value],
      })),
    },
  ];

  const isOn = (field: AnswerField, value: string) => {
    const current = answers[field];
    return Array.isArray(current)
      ? (current as readonly string[]).includes(value)
      : current === value;
  };

  // The summary: one removable chip per chosen value.
  const chosen: { key: string; label: string; href: string }[] = [];
  for (const group of groups)
    for (const option of group.options)
      if (isOn(group.field, option.value))
        chosen.push({
          key: `${group.field}-${option.value}`,
          label: option.label,
          href: finderHref(toggleAnswer(answers, group.field, option.value)),
        });
  if (answers.faceWidthMm !== null)
    chosen.push({
      key: 'width',
      label: t('results.width', { width: answers.faceWidthMm }),
      href: finderHref({ ...answers, faceWidthMm: null }),
    });

  const empty = chosen.length === 0;

  return (
    <section aria-labelledby="finder-answers" className="space-y-3">
      <h2 id="finder-answers" className="font-medium">
        {t('results.answers')}
      </h2>
      {chosen.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((entry) => (
            <li key={entry.key}>
              <Link
                href={entry.href as Route}
                scroll={false}
                className={chipClass(true)}
                aria-label={t('results.remove', { answer: entry.label })}
              >
                {entry.label}
                <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {empty ? <p className="text-caption text-ink-secondary">{t('results.noAnswers')}</p> : null}
      <Disclosure summary={t('results.edit')} defaultOpen={empty}>
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.field}>
              <h3 className="text-caption font-medium text-ink">{group.title}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {group.options.map((option) => {
                  const on = isOn(group.field, option.value);
                  return (
                    <li key={option.value}>
                      <Link
                        href={finderHref(toggleAnswer(answers, group.field, option.value)) as Route}
                        scroll={false}
                        aria-current={on ? 'true' : undefined}
                        className={chipClass(on)}
                      >
                        {option.swatch ? (
                          <span
                            aria-hidden="true"
                            className="size-4 rounded-pill ring-1 ring-hairline"
                            style={{ background: option.swatch }}
                          />
                        ) : null}
                        {option.label}
                        {on ? <span className="sr-only">{t('results.selected')}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Disclosure>
    </section>
  );
}
