'use client';

import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { PasswordField } from '@/components/auth/password-field';
import { newPasswordError, PASSWORD_MIN_LENGTH } from '@/components/auth/password-problem';
import { useRequest } from '@/components/auth/use-request';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/account-api';

/**
 * "Create an account after purchase": an opt-in after a guest checkout.
 * The order's email is used; the customer only chooses a password.
 */
export function CreateAccount({
  number,
  token,
  email,
}: {
  number: string;
  token: string;
  email: string;
}) {
  const t = useTranslations('order.createAccount');
  const tAuth = useTranslations('auth');
  const tErrors = useTranslations('auth.errors');
  const request = useRequest(tAuth('failed'));
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = newPasswordError(tErrors, password, email);
    setProblem(error);
    if (error) return;
    const session = await request.run(() => authApi.registerFromOrder(number, token, password));
    if (session) setDone(true);
  };

  if (done)
    return (
      <p role="status" className="rounded-card bg-success/10 p-5 text-success-ink">
        {t('done')}
      </p>
    );
  return (
    <section
      aria-labelledby="create-account"
      className="space-y-4 rounded-card bg-surface-muted p-6"
    >
      <h2 id="create-account" className="text-title font-semibold">
        {t('title')}
      </h2>
      <p className="max-w-prose text-ink-secondary">{t('body', { email })}</p>
      <form noValidate onSubmit={(event) => void submit(event)} className="max-w-sm space-y-4">
        <PasswordField
          id="order-account-password"
          label={t('password')}
          autoComplete="new-password"
          value={password}
          error={problem ?? request.fields.password}
          hint={tAuth('passwordHint', { min: PASSWORD_MIN_LENGTH })}
          onChange={setPassword}
        />
        <p role="alert" className="text-caption text-danger-ink empty:hidden">
          {request.error}
        </p>
        <Button type="submit" disabled={request.pending}>
          {request.pending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </section>
  );
}
