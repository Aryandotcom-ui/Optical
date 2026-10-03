'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { TextField } from '@/components/checkout/fields';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/account-api';
import { PasswordField } from './password-field';
import { newPasswordError, PASSWORD_MIN_LENGTH } from './password-problem';
import { useRequest } from './use-request';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const request = useRequest(t('failed'));
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = email.trim();
    setInvalid(!EMAIL.test(value));
    if (!EMAIL.test(value)) return;
    const sent = await request.run(() => authApi.forgotPassword(value));
    if (sent) setSentTo(value);
  };

  if (sentTo)
    return (
      <div role="status" className="space-y-4">
        <h2 className="text-title font-semibold">{t('sentTitle')}</h2>
        <p className="text-ink-secondary">{t('sent', { email: sentTo })}</p>
        <Button asChild variant="secondary">
          <Link href="/sign-in">{t('backToSignIn')}</Link>
        </Button>
      </div>
    );

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
      <TextField
        id="forgot-email"
        label={t('email')}
        type="email"
        autoComplete="email"
        value={email}
        error={invalid ? t('errors.email') : request.fields.email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <p role="alert" className="text-caption text-danger-ink empty:hidden">
        {request.error}
      </p>
      <Button type="submit" size="lg" className="w-full" disabled={request.pending}>
        {request.pending ? t('sending') : t('send')}
      </Button>
      <Link
        href="/sign-in"
        className="block text-caption text-accent underline-offset-4 hover:underline"
      >
        {t('backToSignIn')}
      </Link>
    </form>
  );
}

/**
 * The reset link carries its token in the URL fragment, which browsers
 * never send to a server. It is read once and removed from the address bar.
 */
export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('auth.errors');
  const request = useRequest(t('failed'));
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment exists only in the browser
    setToken(value && TOKEN.test(value) ? value : null);
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const error = newPasswordError(tErrors, password);
    setProblem(error);
    if (error) return;
    const result = await request.run(() => authApi.resetPassword(token, password));
    if (result !== undefined) setDone(true);
  };

  if (token === undefined) return null;
  if (done || token === null)
    return (
      <div role="status" className="space-y-4">
        <p className="text-ink-secondary">{done ? t('resetDone') : t('resetMissing')}</p>
        <Button asChild>
          <Link href={done ? '/sign-in' : '/forgot-password'}>
            {done ? t('signIn') : t('forgotTitle')}
          </Link>
        </Button>
      </div>
    );

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
      <PasswordField
        id="reset-password"
        label={t('newPassword')}
        autoComplete="new-password"
        value={password}
        error={problem ?? request.fields.password}
        hint={t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        onChange={setPassword}
      />
      <p role="alert" className="text-caption text-danger-ink empty:hidden">
        {request.error}
      </p>
      <Button type="submit" size="lg" className="w-full" disabled={request.pending}>
        {request.pending ? t('saving') : t('resetSubmit')}
      </Button>
    </form>
  );
}
