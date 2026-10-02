'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { TextField } from '@/components/checkout/fields';
import { Button } from '@/components/ui/button';
import { CommerceError, commerceApi } from '@/lib/commerce-api';

/** Guest tracking: the order number and the email it was placed with. */
export function TrackForm() {
  const t = useTranslations('track');
  const router = useRouter();
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const found = await commerceApi.track(number.trim(), email.trim());
      router.push(`/order/${found.order.number}?token=${encodeURIComponent(found.accessToken)}`);
    } catch (problem) {
      setError(problem instanceof CommerceError ? problem.message : t('failed'));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="max-w-md space-y-4" noValidate>
      <TextField
        id="track-number"
        label={t('number')}
        value={number}
        placeholder="LO-26-001234"
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(event) => {
          setNumber(event.target.value.toUpperCase());
        }}
        hint={t('numberHint')}
      />
      <TextField
        id="track-email"
        label={t('email')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <p aria-live="polite" className="text-caption text-danger-ink">
        {error}
      </p>
      <Button type="submit" size="lg" disabled={busy || !number.trim() || !email.trim()}>
        {busy ? t('finding') : t('submit')}
      </Button>
    </form>
  );
}
