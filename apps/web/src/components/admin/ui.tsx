'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CommerceError } from './admin-api';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-headline font-semibold">{title}</h1>
        {description ? <p className="mt-1 max-w-prose text-ink-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset', className)}
    >
      {title ? <h2 className="mb-3 font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone = /CANCEL|FAIL|REJECT|CORRECTION/.test(value)
    ? 'bg-danger/10 text-danger-ink'
    : /REVIEW|PENDING|REQUESTED/.test(value)
      ? 'bg-warning/10 text-warning-ink'
      : 'bg-surface-muted text-ink';
  return (
    <span
      className={cn(
        'inline-block rounded-pill px-2 py-0.5 text-caption font-medium whitespace-nowrap',
        tone,
      )}
    >
      {value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')}
    </span>
  );
}

/** A message for a failed save: the API's own words, or a fallback. */
export function errorText(error: unknown): string {
  if (error instanceof CommerceError) {
    const first = error.details[0];
    return first ? `${error.message} ${first.path}: ${first.message}` : error.message;
  }
  return 'That didn’t work. Try again.';
}

/** Runs an async action with a busy flag and a status line ("Saved" or the error). */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!message?.ok) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 4000);
    return () => {
      clearTimeout(timer);
    };
  }, [message]);
  const run = async <T,>(action: () => Promise<T>, success = 'Saved.'): Promise<T | null> => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      setMessage({ ok: true, text: success });
      return result;
    } catch (error) {
      setMessage({ ok: false, text: errorText(error) });
      return null;
    } finally {
      setBusy(false);
    }
  };
  const status = message ? (
    <p
      role={message.ok ? 'status' : 'alert'}
      className={cn('text-caption', message.ok ? 'text-success-ink' : 'text-danger-ink')}
    >
      {message.text}
    </p>
  ) : null;
  return { busy, run, status };
}

const control =
  'mt-1 block w-full min-h-11 rounded-control bg-surface px-3 ring-1 ring-hairline ring-inset focus:ring-2 focus:ring-accent focus:outline-none';

export function Field({
  label,
  hint,
  className,
  ...input
}: { label: string; hint?: string; className?: string } & Omit<
  React.ComponentProps<'input'>,
  'className'
>) {
  return (
    <label className={cn('block text-caption font-medium', className)}>
      {label}
      <input className={control} {...input} />
      {hint ? <span className="mt-1 block font-normal text-ink-secondary">{hint}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  className,
  ...input
}: { label: string; className?: string } & Omit<React.ComponentProps<'textarea'>, 'className'>) {
  return (
    <label className={cn('block text-caption font-medium', className)}>
      {label}
      <textarea className={cn(control, 'min-h-24 py-2')} {...input} />
    </label>
  );
}

export function Select({
  label,
  options,
  className,
  ...select
}: {
  label: string;
  options: readonly (string | { value: string; label: string })[];
  className?: string;
} & Omit<React.ComponentProps<'select'>, 'className'>) {
  return (
    <label className={cn('block text-caption font-medium', className)}>
      {label}
      <select className={control} {...select}>
        {options.map((option) => {
          const { value, label: text } =
            typeof option === 'string' ? { value: option, label: option } : option;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function Check({ label, ...input }: { label: string } & React.ComponentProps<'input'>) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-caption font-medium">
      <input type="checkbox" className="size-5 accent-[var(--color-accent)]" {...input} />
      {label}
    </label>
  );
}

/** Rupees in a form, stored as paise. */
export const toMinor = (rupees: string) => Math.round(Number(rupees) * 100);
export const toRupees = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? '' : String(minor / 100);
