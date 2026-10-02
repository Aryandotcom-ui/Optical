'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const control =
  'mt-1 min-h-12 w-full rounded-card bg-surface px-4 ring-1 ring-hairline ring-inset focus:ring-2 focus:ring-accent focus:outline-none aria-invalid:ring-danger';

interface FieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  className?: string;
}

/** A labelled text input whose error is announced and linked to it. */
export function TextField({
  id,
  label,
  error,
  hint,
  className,
  ...input
}: FieldProps & Omit<React.ComponentProps<'input'>, 'id' | 'className'>) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className="text-caption font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className={control}
        {...input}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-caption text-ink-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-caption text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  error,
  className,
  children,
  ...select
}: FieldProps & Omit<React.ComponentProps<'select'>, 'id' | 'className'>) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-caption font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(control, 'appearance-none')}
        {...select}
      >
        {children}
      </select>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-caption text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One of the three checkout sections. Completed sections collapse to a
 * one-line summary with an Edit button; nothing typed is ever thrown away.
 */
export function CheckoutSection({
  number,
  title,
  open,
  summary,
  onEdit,
  editLabel,
  children,
}: {
  number: number;
  title: string;
  open: boolean;
  summary: ReactNode;
  onEdit: () => void;
  editLabel: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`checkout-${number}`}
      className="rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={`checkout-${number}`} className="flex items-center gap-3 text-title font-semibold">
          <span
            aria-hidden="true"
            className={cn(
              'tabular inline-flex size-7 items-center justify-center rounded-pill text-caption',
              open ? 'bg-ink text-background' : 'bg-surface-muted text-ink-secondary',
            )}
          >
            {number}
          </span>
          {title}
        </h2>
        {!open && summary ? (
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 px-2 text-caption font-medium text-accent hover:underline"
          >
            {editLabel}
            <span className="sr-only">{`: ${title}`}</span>
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-5">{children}</div>
      ) : summary ? (
        <div className="mt-2 pl-10 text-caption text-ink-secondary">{summary}</div>
      ) : null}
    </section>
  );
}
