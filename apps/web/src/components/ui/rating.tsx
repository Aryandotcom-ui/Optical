import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Five stars with partial fill; the label carries the meaning for screen readers. */
export function RatingStars({
  value,
  label,
  size = 'sm',
}: {
  value: number;
  label: string;
  size?: 'sm' | 'md';
}) {
  const iconClass = size === 'sm' ? 'size-3.5' : 'size-5';
  return (
    <span className="inline-flex items-center" role="img" aria-label={label}>
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, value - index));
        return (
          <span key={index} className={cn('relative inline-block', iconClass)}>
            <Star
              aria-hidden="true"
              className={cn('absolute inset-0 text-hairline', iconClass)}
              fill="currentColor"
              strokeWidth={0}
            />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star
                aria-hidden="true"
                className={cn('text-ink', iconClass)}
                fill="currentColor"
                strokeWidth={0}
              />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** One star and the average, for tight spaces such as product cards. */
export function RatingCompact({
  value,
  count,
  label,
}: {
  value: number;
  count: number;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-caption text-ink-secondary"
      role="img"
      aria-label={label}
    >
      <Star aria-hidden="true" className="size-3.5 text-ink" fill="currentColor" strokeWidth={0} />
      <span aria-hidden="true" className="tabular font-medium text-ink">
        {value.toFixed(1)}
      </span>
      <span aria-hidden="true" className="tabular">
        ({count})
      </span>
    </span>
  );
}
