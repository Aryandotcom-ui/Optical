import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A collapsible section on native <details>/<summary>: keyboard, screen
 * reader and find-in-page support come from the browser, with no script.
 */
export function Disclosure({
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  summary: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={cn('group border-b border-hairline', className)}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-body-lg font-medium transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.5}
          className="duration-ui size-5 shrink-0 text-ink-secondary transition-transform ease-standard group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="pb-5 text-ink-secondary">{children}</div>
    </details>
  );
}
