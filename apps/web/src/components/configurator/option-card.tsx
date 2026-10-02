'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface OptionCardProps {
  type: 'radio' | 'checkbox';
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  price?: ReactNode;
  badge?: ReactNode;
  /** Why the option can't be chosen; shown under it, never hidden. */
  disabledReason?: string | null;
  children?: ReactNode;
}

/**
 * A choice in the configurator: a native radio or checkbox (so keyboard and
 * screen readers work as expected) styled as a card. Unavailable options
 * stay visible with the reason, rather than disappearing.
 */
export function OptionCard({
  type,
  name,
  value,
  checked,
  onChange,
  title,
  description,
  price,
  badge,
  disabledReason,
  children,
}: OptionCardProps) {
  const disabled = Boolean(disabledReason);
  const reasonId = `${name}-${value}-reason`;
  return (
    <div>
      <label
        className={cn(
          'duration-micro flex cursor-pointer gap-3 rounded-card bg-surface p-4 ring-1 ring-hairline transition-shadow ease-standard ring-inset',
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
          checked ? 'ring-2 ring-ink' : 'hover:ring-ink-secondary',
          disabled && 'cursor-not-allowed bg-surface-muted hover:ring-hairline',
        )}
      >
        <input
          type={type}
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          aria-describedby={disabled ? reasonId : undefined}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
          className={cn(
            'mt-1 size-4 shrink-0 accent-[var(--color-accent)]',
            type === 'radio' ? 'rounded-pill' : 'rounded-sm',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className={cn('font-medium', disabled && 'text-ink-secondary')}>
              {title}
              {badge ? <span className="ml-2 align-middle">{badge}</span> : null}
            </span>
            {price ? (
              <span className="tabular text-caption text-ink-secondary">{price}</span>
            ) : null}
          </span>
          {description ? (
            <span className="mt-1 block text-caption text-ink-secondary">{description}</span>
          ) : null}
          {disabledReason ? (
            <span id={reasonId} className="mt-2 block text-caption text-warning-ink">
              {disabledReason}
            </span>
          ) : null}
        </span>
      </label>
      {checked && children ? <div className="mt-3 pl-4">{children}</div> : null}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-pill bg-surface-muted px-2 py-0.5 text-[0.75rem] font-medium text-ink ring-1 ring-hairline ring-inset">
      {children}
    </span>
  );
}
