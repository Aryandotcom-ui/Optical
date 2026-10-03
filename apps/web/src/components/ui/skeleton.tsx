import { cn } from '@/lib/cn';

/** Placeholder block with a gentle shimmer; sized by the caller to match the final layout. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer bg-surface-muted',
        !className?.includes('rounded-') && 'rounded-control',
        className,
      )}
    />
  );
}
