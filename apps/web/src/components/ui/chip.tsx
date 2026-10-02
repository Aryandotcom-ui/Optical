import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Toggle pill for filters and options. Exposes its state with aria-pressed. */
export function Chip({
  pressed,
  className,
  children,
  ...props
}: ComponentProps<'button'> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        'duration-micro inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-body ring-1 transition-[background-color,color,box-shadow] ease-standard ring-inset',
        pressed
          ? 'bg-ink text-background ring-ink'
          : 'bg-surface text-ink ring-hairline hover:ring-ink-secondary',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
