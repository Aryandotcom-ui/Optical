'use client';

import { Minus, Plus } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

interface RxStepperProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  step: number;
  /** Where the stepper starts when empty and nudged. */
  start: number;
  format: (value: number) => string;
  /** Empty means "not on my prescription" (CYL, AXIS, ADD). */
  allowEmpty?: boolean;
  emptyLabel?: string;
  invalid?: boolean;
  describedBy?: string;
  decrementLabel: string;
  incrementLabel: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const snap = (value: number, step: number) => Math.round(value / step) * step;

/**
 * A prescription value: a spin button that moves in the lab's steps
 * (0.25 D, 1°, 0.5 mm) with −/+ buttons, arrow keys, Page Up/Down and
 * Home/End, or accepts typed values. Typing is checked on leaving the
 * field, so half-typed numbers like "-" never get rejected mid-entry.
 */
export function RxStepper({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  start,
  format,
  allowEmpty = false,
  emptyLabel = '–',
  invalid,
  describedBy,
  decrementLabel,
  incrementLabel,
}: RxStepperProps) {
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? (value === null ? '' : format(value));

  const nudge = (steps: number) => {
    const base = value ?? start;
    const next = value === null && steps !== 0 ? start : snap(base + steps * step, step);
    onChange(Number(clamp(next, min, max).toFixed(2)));
  };

  const commit = () => {
    if (typing === null) return;
    const cleaned = typing.trim().replace('−', '-').replace(/^\+/, '');
    setTyping(null);
    if (cleaned === '') {
      if (allowEmpty) onChange(null);
      return;
    }
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) onChange(Number(parsed.toFixed(2)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const keys: Record<string, () => void> = {
      ArrowUp: () => {
        nudge(1);
      },
      ArrowDown: () => {
        nudge(-1);
      },
      PageUp: () => {
        nudge(4);
      },
      PageDown: () => {
        nudge(-4);
      },
      Home: () => {
        onChange(min);
      },
      End: () => {
        onChange(max);
      },
      Enter: commit,
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    setTyping(null);
    action();
  };

  const button =
    'inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-secondary hover:bg-surface-muted hover:text-ink disabled:opacity-30';
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-caption font-medium text-ink-secondary">
        {label}
      </label>
      <div
        className={cn(
          'mt-1 flex items-center rounded-pill bg-surface ring-1 ring-hairline ring-inset focus-within:ring-2 focus-within:ring-accent',
          invalid && 'ring-danger',
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={decrementLabel}
          className={button}
          disabled={value !== null && value <= min}
          onClick={() => {
            nudge(-1);
          }}
        >
          <Minus aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
        <input
          id={id}
          role="spinbutton"
          inputMode="decimal"
          autoComplete="off"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value ?? undefined}
          aria-valuetext={value === null ? emptyLabel : format(value)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          placeholder={emptyLabel}
          value={shown}
          onChange={(event) => {
            setTyping(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="tabular h-10 w-full min-w-0 bg-transparent text-center outline-none placeholder:text-ink-secondary"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={incrementLabel}
          className={button}
          disabled={value !== null && value >= max}
          onClick={() => {
            nudge(1);
          }}
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

/** "+1.25", "−2.50", "0.00" */
export function formatDioptres(value: number): string {
  if (value === 0) return '0.00';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
}
