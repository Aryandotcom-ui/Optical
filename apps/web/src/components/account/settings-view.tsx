'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { PasswordField } from '@/components/auth/password-field';
import { newPasswordError, PASSWORD_MIN_LENGTH } from '@/components/auth/password-problem';
import { useRequest } from '@/components/auth/use-request';
import { TextField } from '@/components/checkout/fields';
import { Button } from '@/components/ui/button';
import { accountApi } from '@/lib/account-api';
import { notify } from '@/lib/notify';
import { useSession } from '@/lib/session';

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-4 rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset sm:p-6"
    >
      <div>
        <h2 id={id} className="text-title font-semibold">
          {title}
        </h2>
        {intro ? <p className="mt-1 max-w-prose text-ink-secondary">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

const FormError = ({ message }: { message: string | null }) => (
  <p role="alert" className="text-caption text-danger-ink empty:hidden">
    {message}
  </p>
);

function ProfileForm() {
  const t = useTranslations('account.settings');
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const request = useRequest(t('failed'));
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [marketing, setMarketing] = useState(user?.marketingOptIn ?? false);
  if (!user) return null;

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await request.run(() =>
      accountApi.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        marketingOptIn: marketing,
      }),
    );
    if (saved) void notify(t('saved'));
  };
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2">
      <TextField
        id="profile-name"
        label={t('name')}
        autoComplete="name"
        value={name}
        error={request.fields.name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <TextField
        id="profile-phone"
        label={t('phone')}
        type="tel"
        autoComplete="tel"
        value={phone}
        error={request.fields.phone}
        onChange={(event) => {
          setPhone(event.target.value);
        }}
      />
      <TextField
        id="profile-email"
        label={t('email')}
        value={user.email}
        readOnly
        hint={t('emailHint')}
        className="sm:col-span-2"
      />
      <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(event) => {
            setMarketing(event.target.checked);
          }}
          className="size-5 accent-[var(--color-accent)]"
        />
        {t('marketing')}
      </label>
      <div className="space-y-2 sm:col-span-2">
        <FormError message={request.error} />
        <Button type="submit" disabled={request.pending}>
          {request.pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const t = useTranslations('account.settings');
  const tAuth = useTranslations('auth');
  const tErrors = useTranslations('auth.errors');
  const session = useSession();
  const request = useRequest(t('failed'));
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const email = session.status === 'signed-in' ? session.user.email : '';

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = newPasswordError(tErrors, next, email);
    setProblem(error);
    if (error || !current) return;
    const done = await request.run(() =>
      accountApi.changePassword({ currentPassword: current, newPassword: next }),
    );
    if (done !== undefined) {
      setCurrent('');
      setNext('');
      void notify(t('changed'));
    }
  };
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2">
      <PasswordField
        id="current-password"
        label={t('currentPassword')}
        autoComplete="current-password"
        value={current}
        error={request.fields.currentPassword}
        onChange={setCurrent}
      />
      <PasswordField
        id="new-password"
        label={t('newPassword')}
        autoComplete="new-password"
        value={next}
        error={problem ?? request.fields.newPassword}
        hint={tAuth('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        onChange={setNext}
      />
      <div className="space-y-2 sm:col-span-2">
        <FormError message={request.error} />
        <Button type="submit" disabled={request.pending}>
          {request.pending ? t('saving') : t('changePassword')}
        </Button>
      </div>
    </form>
  );
}

function DeleteAccount() {
  const t = useTranslations('account.settings');
  const router = useRouter();
  const request = useRequest(t('failed'));
  const [password, setPassword] = useState('');
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) return;
    const done = await request.run(() => accountApi.deleteAccount(password));
    if (done !== undefined) {
      void notify(t('deleted'));
      router.replace('/');
    }
  };
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
      <PasswordField
        id="delete-password"
        label={t('deletePassword')}
        autoComplete="current-password"
        value={password}
        error={request.fields.password}
        onChange={setPassword}
        className="max-w-sm"
      />
      <FormError message={request.error} />
      <Button
        type="submit"
        disabled={request.pending || !password}
        variant="secondary"
        className="text-danger-ink"
      >
        {request.pending ? t('deleting') : t('deleteConfirm')}
      </Button>
    </form>
  );
}

export function SettingsView() {
  const t = useTranslations('account.settings');
  const [exportError, setExportError] = useState(false);
  return (
    <div className="space-y-6">
      <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
      <Section id="settings-profile" title={t('profile')}>
        <ProfileForm />
      </Section>
      <Section id="settings-password" title={t('password')} intro={t('passwordIntro')}>
        <PasswordForm />
      </Section>
      <Section id="settings-data" title={t('data')} intro={t('dataIntro')}>
        <Button
          variant="secondary"
          onClick={() => {
            setExportError(false);
            accountApi.downloadExport().catch(() => {
              setExportError(true);
            });
          }}
        >
          {t('export')}
        </Button>
        <FormError message={exportError ? t('exportFailed') : null} />
      </Section>
      <Section id="settings-delete" title={t('delete')} intro={t('deleteIntro')}>
        <DeleteAccount />
      </Section>
    </div>
  );
}
