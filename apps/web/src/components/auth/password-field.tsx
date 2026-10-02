'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/** A password input with a show/hide toggle; the error is announced and linked to it. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  autoComplete: 'current-password' | 'new-password';
  className?: string;
}) {
  const t = useTranslations('auth');
  const [visible, setVisible] = useState(false);
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className="text-caption font-medium">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          maxLength={512}
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={cn(
            'min-h-12 w-full rounded-card bg-surface py-0 pr-14 pl-4 ring-1 ring-hairline ring-inset',
            'focus:ring-2 focus:ring-accent focus:outline-none aria-invalid:ring-danger',
          )}
        />
        <button
          type="button"
          aria-label={visible ? t('hide') : t('show')}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => {
            setVisible(!visible);
          }}
          className="absolute inset-y-0 right-1 my-auto inline-flex size-11 items-center justify-center rounded-pill text-ink-secondary hover:text-ink"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-5" strokeWidth={1.5} />
          ) : (
            <Eye aria-hidden="true" className="size-5" strokeWidth={1.5} />
          )}
        </button>
      </div>
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
