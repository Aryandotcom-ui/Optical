'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { TextField } from '@/components/checkout/fields';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/account-api';
import { safeNext } from '@/lib/safe-next';
import { PasswordField } from './password-field';
import { newPasswordError, PASSWORD_MIN_LENGTH } from './password-problem';
import { useRequest } from './use-request';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FormError({ message }: { message: string | null }) {
  return (
    <p role="alert" className="text-caption text-danger-ink empty:hidden">
      {message}
    </p>
  );
}

/** Links between the sign-in pages keep where the customer was going. */
const withNext = (path: string, next: string | undefined) =>
  (next ? `${path}?next=${encodeURIComponent(next)}` : path) as Route;

export function SignInForm({ next }: { next: string | undefined }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const request = useRequest(t('failed'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [local, setLocal] = useState<{ email?: string; password?: string }>({});

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = {
      ...(EMAIL.test(email.trim()) ? {} : { email: t('errors.email') }),
      ...(password ? {} : { password: t('errors.password') }),
    };
    setLocal(errors);
    if (Object.keys(errors).length) return;
    const session = await request.run(() => authApi.login({ email: email.trim(), password }));
    if (session) router.replace(safeNext(next) as Route);
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
      <TextField
        id="sign-in-email"
        label={t('email')}
        type="email"
        autoComplete="email"
        value={email}
        error={local.email ?? request.fields.email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <PasswordField
        id="sign-in-password"
        label={t('password')}
        autoComplete="current-password"
        value={password}
        error={local.password}
        onChange={setPassword}
      />
      <FormError message={request.error} />
      <Button type="submit" size="lg" className="w-full" disabled={request.pending}>
        {request.pending ? t('signingIn') : t('signIn')}
      </Button>
      <div className="flex flex-wrap justify-between gap-3 text-caption">
        <Link href="/forgot-password" className="text-accent underline-offset-4 hover:underline">
          {t('forgot')}
        </Link>
        <p className="text-ink-secondary">
          {t('noAccount')}{' '}
          <Link
            href={withNext('/register', next)}
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {t('createOne')}
          </Link>
        </p>
      </div>
    </form>
  );
}

export function RegisterForm({ next }: { next: string | undefined }) {
  const t = useTranslations('auth');
  const tErrors = useTranslations('auth.errors');
  const router = useRouter();
  const request = useRequest(t('failed'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const passwordError = newPasswordError(tErrors, password, email.trim());
    const errors: Record<string, string> = {
      ...(name.trim().length >= 2 ? {} : { name: t('errors.name') }),
      ...(EMAIL.test(email.trim()) ? {} : { email: t('errors.email') }),
      ...(passwordError ? { password: passwordError } : {}),
    };
    setLocal(errors);
    if (Object.keys(errors).length) return;
    const session = await request.run(() =>
      authApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
        marketingOptIn: marketing,
      }),
    );
    if (session) router.replace(safeNext(next) as Route);
  };
  const error = (field: string) => local[field] ?? request.fields[field];

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
      <TextField
        id="register-name"
        label={t('name')}
        autoComplete="name"
        value={name}
        error={error('name')}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <TextField
        id="register-email"
        label={t('email')}
        type="email"
        autoComplete="email"
        value={email}
        error={error('email')}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <PasswordField
        id="register-password"
        label={t('password')}
        autoComplete="new-password"
        value={password}
        error={error('password')}
        hint={t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        onChange={setPassword}
      />
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(event) => {
            setMarketing(event.target.checked);
          }}
          className="mt-1 size-5 accent-[var(--color-accent)]"
        />
        <span className="text-caption text-ink-secondary">{t('marketing')}</span>
      </label>
      <FormError message={request.error} />
      <Button type="submit" size="lg" className="w-full" disabled={request.pending}>
        {request.pending ? t('registering') : t('register')}
      </Button>
      <p className="text-caption text-ink-secondary">
        {t('haveAccount')}{' '}
        <Link
          href={withNext('/sign-in', next)}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}
