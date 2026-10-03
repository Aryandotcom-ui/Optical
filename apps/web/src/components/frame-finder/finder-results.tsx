import type { FinderAnswers } from '@optical/shared/frame-finder';
import type { FinderResults as Results } from '@optical/shared/frame-finder/schemas';
import { Camera } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ProductCard } from '@/components/product/product-card';
import { Button } from '@/components/ui/button';
import { finderHref } from '@/lib/finder-params';
import { AnswerEditor } from './answer-editor';

type Reason = Results['items'][number]['reasons'][number];

/** Frames sent to try-on from "Try these on". */
const TRY_ON_COUNT = 6;

/**
 * Ranked frames for the answers, each with its score and the reasons it
 * matches, beside the answers themselves (editable in place).
 */
export async function FinderResults({
  answers,
  results,
}: {
  answers: FinderAnswers;
  results: Results | null;
}) {
  const t = await getTranslations('frameFinder');
  const tFilters = await getTranslations('filters');
  const format = await getFormatter();
  const retryHref = finderHref(answers) as Route;

  const reasonText = (reason: Reason): string => {
    switch (reason.criterion) {
      case 'shape':
        return t('reasons.shape', {
          faceShape: t(`faceShapes.${reason.faceShape}`).toLowerCase(),
        });
      case 'size':
        return t('reasons.size');
      case 'style':
        return t('reasons.style', { tags: format.list(reason.tags) });
      case 'budget':
        return t('reasons.budget');
      case 'use':
        return t('reasons.use', { use: t(`useReasons.${reason.use}`) });
      case 'material':
        return t('reasons.material', {
          material: tFilters(`materialValues.${reason.material}`),
        });
      case 'colour':
        return t('reasons.colour', {
          colour: tFilters(`colourValues.${reason.colour}`).toLowerCase(),
        });
    }
  };

  const items = results?.items ?? [];
  const tryOn = items
    .filter((item) => item.product.shape !== null)
    .slice(0, TRY_ON_COUNT)
    .map((item) => item.product.slug);

  return (
    <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <AnswerEditor answers={answers} />
        <p className="mt-6">
          <Link
            href={'/frame-finder'}
            className="text-caption font-medium text-accent hover:underline"
          >
            {t('results.startOver')}
          </Link>
        </p>
      </aside>

      <section aria-labelledby="finder-results" className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="finder-results" className="text-title font-semibold">
              {t('results.title')}
            </h2>
            {results ? (
              <p className="mt-1 text-ink-secondary" aria-live="polite">
                {t('results.count', { count: items.length })}
              </p>
            ) : null}
          </div>
          {tryOn.length > 0 ? (
            <Button asChild variant="secondary">
              <Link href={`/try-on?frames=${tryOn.join(',')}&frame=${tryOn[0] ?? ''}` as Route}>
                <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('results.tryAll')}
              </Link>
            </Button>
          ) : null}
        </div>

        {results === null ? (
          <div role="alert" className="space-y-3 rounded-card bg-surface-muted p-6">
            <p>{t('results.error')}</p>
            <Button asChild variant="secondary">
              <Link href={retryHref}>{t('results.retry')}</Link>
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-card bg-surface-muted p-6">{t('results.none')}</p>
        ) : (
          <ol className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3">
            {items.map((item, index) => (
              <li key={item.product.id} className="flex flex-col gap-3">
                <ProductCard
                  product={item.product}
                  priority={index < 3}
                  sizes="(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw"
                />
                <div className="text-caption">
                  <p className="font-medium">{t('results.match', { score: item.score })}</p>
                  {item.reasons.length > 0 ? (
                    <p className="mt-1 text-ink-secondary">
                      <span className="font-medium text-ink">{t('results.why')}</span>{' '}
                      {item.reasons.map(reasonText).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
