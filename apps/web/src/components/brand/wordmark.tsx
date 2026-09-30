import { brand } from '@optical/config/brand';
import { cn } from '@/lib/cn';

/**
 * The brand wordmark: two overlapping lens rings and the lowercase name.
 * The accessible name is the full brand name, not the stylised wordmark.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-ink', className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 32 16"
        className="h-[0.9em] w-auto"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
      >
        <circle cx="8" cy="8" r="6" />
        <circle cx="24" cy="8" r="6" />
        <path d="M14 8c1.2-1.4 2.8-1.4 4 0" strokeLinecap="round" />
      </svg>
      <span className="font-semibold tracking-[-0.03em]" aria-hidden="true">
        {brand.wordmark}
      </span>
      <span className="sr-only">{brand.name}</span>
    </span>
  );
}
