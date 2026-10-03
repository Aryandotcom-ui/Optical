/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- a scrollable region must take focus so keyboard users can scroll it (WCAG 2.1.1) */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A horizontally scrollable, focusable region for wide content such as tables on phones. */
export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={cn('overflow-x-auto', className)}>
      {children}
    </div>
  );
}
