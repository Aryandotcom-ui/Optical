'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** For guests: an account is optional, so this is a line, never a wall. */
export function SignInPrompt() {
  const t = useTranslations('checkout.account');
  return (
    <p className="text-caption text-ink-secondary">
      {t.rich('signInPrompt', {
        link: (chunks) => (
          <Link
            href="/sign-in?next=/checkout"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}

/** For signed-in customers: keep this delivery address in the account. */
export function SaveAddressToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslations('checkout.account');
  return (
    <label className="mt-4 flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="size-5 accent-[var(--color-accent)]"
      />
      {t('saveAddress')}
    </label>
  );
}
