'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { CommerceError } from '@/lib/commerce-api';

/** Apply or remove a coupon. The server decides; its message says why a code didn't work. */
export function CouponForm({
  applied,
  onApply,
  onRemove,
}: {
  applied: string | null;
  onApply: (code: string) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const t = useTranslations('bag.coupon');
  const id = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onApply(code.trim());
      setCode('');
    } catch (problem) {
      setError(problem instanceof CommerceError ? problem.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  if (applied)
    return (
      <p className="flex items-center justify-between gap-3 rounded-pill bg-success-ink/10 py-1 pr-1 pl-4 text-caption font-medium text-success-ink">
        {t('applied', { code: applied })}
        <button
          type="button"
          onClick={() => void onRemove()}
          aria-label={t('remove', { code: applied })}
          className="inline-flex size-9 items-center justify-center rounded-pill hover:bg-success-ink/10"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </p>
    );

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <label htmlFor={`${id}-code`} className="text-caption font-medium">
        {t('label')}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={`${id}-code`}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setError(null);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-pill bg-surface px-4 uppercase ring-1 ring-hairline ring-inset focus:ring-2 focus:ring-accent focus:outline-none aria-invalid:ring-danger"
        />
        <Button type="submit" variant="secondary" disabled={busy || !code.trim()}>
          {t('apply')}
        </Button>
      </div>
      <p id={`${id}-error`} aria-live="polite" className="mt-1 text-caption text-danger-ink">
        {error}
      </p>
    </form>
  );
}
