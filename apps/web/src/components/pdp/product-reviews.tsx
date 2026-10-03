import { reviewSorts, type ReviewList, type ReviewSort } from '@optical/shared/catalog';
import { BadgeCheck } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { RatingStars } from '@/components/ui/rating';
import { cn } from '@/lib/cn';
import { formatLongDate } from '@/lib/format';

/** The most review pages rendered at once ("show more" adds one each time). */
export const MAX_REVIEW_PAGES = 10;

async function Histogram({ summary }: { summary: ReviewList['summary'] }) {
  const t = await getTranslations('pdp.reviews');
  return (
    <ul className="space-y-1.5" aria-label={t('breakdown')}>
      {(['5', '4', '3', '2', '1'] as const).map((stars) => {
        const count = summary.histogram[stars];
        const share = summary.count ? count / summary.count : 0;
        return (
          <li key={stars} className="flex items-center gap-3 text-caption">
            <span className="w-14 shrink-0 text-ink-secondary">
              {t('stars', { count: Number(stars) })}
            </span>
            <span
              aria-hidden="true"
              className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-muted"
            >
              <span
                className="block h-full rounded-pill bg-ink"
                style={{ width: `${share * 100}%` }}
              />
            </span>
            <span className="tabular w-6 shrink-0 text-right text-ink-secondary">{count}</span>
            <span className="sr-only">{t('histogramRow', { stars: Number(stars), count })}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Published reviews with a rating breakdown, rendered on the server. Sorting
 * and "show more" are links (`?reviews=` and `?reviewPage=`), so they work
 * without JavaScript and cost the page none. "Verified purchase" means the
 * review is tied to a delivered order.
 */
export async function ProductReviews({
  productName,
  pages,
  sort,
  href,
}: {
  productName: string;
  pages: ReviewList[];
  sort: ReviewSort;
  /** Builds a link to this product page with the given review settings. */
  href: (sort: ReviewSort, page: number) => string;
}) {
  const t = await getTranslations('pdp.reviews');
  const first = pages[0];
  if (!first || first.summary.count === 0) {
    return (
      <div className="rounded-card bg-surface-muted p-8 text-center">
        <p className="font-medium">{t('noneTitle')}</p>
        <p className="mt-1 text-ink-secondary">{t('noneBody', { name: productName })}</p>
      </div>
    );
  }
  const { summary } = first;
  const last = pages.at(-1) ?? first;
  const hasMore = last.page * last.pageSize < last.total && pages.length < MAX_REVIEW_PAGES;
  const reviews = pages.flatMap((page) => page.items);

  return (
    <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <p className="tabular text-display-md font-semibold">{summary.average?.toFixed(1)}</p>
          <div className="pb-2">
            <RatingStars
              value={summary.average ?? 0}
              size="md"
              label={t('averageLabel', { rating: summary.average ?? 0, count: summary.count })}
            />
            <p className="text-caption text-ink-secondary">
              {t('count', { count: summary.count })}
            </p>
          </div>
        </div>
        <Histogram summary={summary} />
      </div>

      <div>
        <nav aria-label={t('sortBy')} className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-secondary">{t('sortBy')}</span>
          {reviewSorts.map((option) => (
            <Link
              key={option}
              href={href(option, 1) as Route}
              scroll={false}
              aria-current={option === sort ? 'true' : undefined}
              className={cn(
                'duration-micro inline-flex min-h-9 items-center rounded-pill px-3 text-caption font-medium transition-colors ease-standard',
                option === sort ? 'bg-ink text-background' : 'bg-surface-muted hover:bg-hairline',
              )}
            >
              {t(`sort.${option}`)}
            </Link>
          ))}
        </nav>

        <ul className="mt-4 divide-y divide-hairline">
          {reviews.map((review) => (
            <li key={review.id} className="py-6">
              <article>
                <RatingStars
                  value={review.rating}
                  label={t('reviewRating', { rating: review.rating })}
                />
                <h3 className="mt-2 font-medium">{review.title}</h3>
                <p className="mt-1 whitespace-pre-line text-ink-secondary">{review.body}</p>
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-secondary">
                  <span className="font-medium text-ink">{review.authorName}</span>
                  <time dateTime={review.createdAt}>{formatLongDate(review.createdAt)}</time>
                  {review.verifiedPurchase ? (
                    <span className="inline-flex items-center gap-1 text-success-ink">
                      <BadgeCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('verified')}
                    </span>
                  ) : null}
                  {review.helpfulCount > 0 ? (
                    <span>{t('helpful', { count: review.helpfulCount })}</span>
                  ) : null}
                </p>
              </article>
            </li>
          ))}
        </ul>

        {hasMore ? (
          <div className="mt-2 flex justify-center">
            <Link
              href={href(sort, pages.length + 1) as Route}
              scroll={false}
              className={buttonVariants({ variant: 'secondary' })}
            >
              {t('more')}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
