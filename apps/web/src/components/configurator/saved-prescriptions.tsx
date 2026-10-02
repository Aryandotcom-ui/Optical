'use client';

import type { SavedPrescription } from '@optical/shared/account';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { accountApi } from '@/lib/account-api';
import { cn } from '@/lib/cn';
import { rxDraftFrom, type LensDraft } from './lens-draft';

/**
 * The account's saved prescriptions, to pick one instead of typing. A
 * choice with typed values also fills them in, so thickness advice uses them.
 */
export function SavedPrescriptionPicker({
  draft,
  onPick,
}: {
  draft: LensDraft;
  onPick: (patch: Partial<LensDraft>) => void;
}) {
  const t = useTranslations('configurator.saved');
  const format = useFormatter();
  const [list, setList] = useState<SavedPrescription[] | null | 'error'>(null);

  useEffect(() => {
    accountApi.prescriptions().then(setList, () => {
      setList('error');
    });
  }, []);

  if (list === null) return <Skeleton className="h-16 w-full rounded-card" />;
  if (list === 'error' || list.length === 0)
    return (
      <p className="text-caption text-ink-secondary">
        {t('none')}{' '}
        <Link
          href="/account/prescriptions"
          className="text-accent underline-offset-4 hover:underline"
        >
          {t('manage')}
        </Link>
      </p>
    );

  const date = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  return (
    <fieldset className="space-y-2">
      <legend className="text-caption font-medium">{t('choose')}</legend>
      {list.map((entry) => {
        const selected = draft.saved?.id === entry.id;
        return (
          <label
            key={entry.id}
            htmlFor={`saved-rx-${entry.id}`}
            className={cn(
              'flex min-h-12 cursor-pointer items-start gap-3 rounded-card p-3 ring-1 ring-inset',
              selected ? 'ring-2 ring-accent' : 'ring-hairline hover:bg-surface-muted',
            )}
          >
            <input
              id={`saved-rx-${entry.id}`}
              type="radio"
              name="saved-prescription"
              className="mt-1 size-4 accent-[var(--color-accent)]"
              checked={selected}
              onChange={() => {
                onPick({
                  saved: { id: entry.id, label: entry.label, hasValues: entry.values !== null },
                  ...(entry.values ? { rx: rxDraftFrom(entry.values) } : {}),
                });
              }}
            />
            <span className="min-w-0 font-medium">
              {entry.label}
              <span className="block text-caption font-normal text-ink-secondary">
                {entry.values ? t('version', { version: entry.version }) : t('fileOnly')}
                {entry.expiresAt && entry.expiry === 'expired'
                  ? ` · ${t('expired', { date: date(entry.expiresAt) })}`
                  : entry.expiresAt && entry.expiry === 'expiring'
                    ? ` · ${t('expiring', { date: date(entry.expiresAt) })}`
                    : ''}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
