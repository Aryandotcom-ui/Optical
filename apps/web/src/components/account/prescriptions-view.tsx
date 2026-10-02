'use client';

import type { SavedPrescription } from '@optical/shared/account';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { TextField } from '@/components/checkout/fields';
import { formatDioptres } from '@/components/configurator/rx-stepper';
import { Button } from '@/components/ui/button';
import { accountApi } from '@/lib/account-api';
import { cn } from '@/lib/cn';
import { notify } from '@/lib/notify';
import { LoadError, LoadingBlock } from './load-states';
import { PrescriptionForm } from './prescription-form';
import { useLoad } from './use-load';

const loadPrescriptions = () => accountApi.prescriptions();

function RxTable({ entry }: { entry: SavedPrescription }) {
  const t = useTranslations('account.prescriptions');
  const values = entry.values;
  if (!values) return <p className="text-caption text-ink-secondary">{t('fileOnly')}</p>;
  const cell = (value: number | null, axis = false) =>
    value === null ? '–' : axis ? `${value}°` : formatDioptres(value);
  const pd =
    values.pd.kind === 'single' ? `${values.pd.value}` : `${values.pd.right} / ${values.pd.left}`;
  return (
    <table className="tabular w-full text-caption">
      <thead className="text-ink-secondary">
        <tr>
          <th scope="col" className="py-1 text-left font-medium">
            <span className="sr-only">{t('right')}</span>
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t('sph')}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t('cyl')}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t('axis')}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t('addPower')}
          </th>
        </tr>
      </thead>
      <tbody>
        {(['right', 'left'] as const).map((side) => (
          <tr key={side} className="border-t border-hairline">
            <th scope="row" className="py-1 text-left font-medium">
              {t(side)}
            </th>
            <td className="py-1 text-right">{cell(values[side].sph)}</td>
            <td className="py-1 text-right">{cell(values[side].cyl)}</td>
            <td className="py-1 text-right">{cell(values[side].axis, true)}</td>
            <td className="py-1 text-right">{cell(values[side].add)}</td>
          </tr>
        ))}
        <tr className="border-t border-hairline">
          <th scope="row" className="py-1 text-left font-medium">
            {t('pd')}
          </th>
          <td colSpan={4} className="py-1 text-right">
            {pd} mm
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function PrescriptionsView() {
  const t = useTranslations('account.prescriptions');
  const format = useFormatter();
  const { state, reload, set } = useLoad(loadPrescriptions);
  const [editing, setEditing] = useState<SavedPrescription | 'new' | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const date = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

  const act = async (id: string, request: () => Promise<SavedPrescription[]>, message: string) => {
    setBusy(id);
    try {
      set(await request());
      void notify(message);
    } catch {
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display-md font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-2 max-w-prose text-ink-secondary">{t('intro')}</p>
        </div>
        {editing === null ? (
          <Button
            onClick={() => {
              setEditing('new');
            }}
          >
            {t('add')}
          </Button>
        ) : null}
      </header>

      {editing !== null ? (
        <PrescriptionForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onCancel={() => {
            setEditing(null);
          }}
          onSave={async (input) => {
            if (editing === 'new') await accountApi.addPrescription(input);
            else await accountApi.updatePrescription(editing.id, input);
            set(await accountApi.prescriptions());
            setEditing(null);
            void notify(t('saved'));
          }}
        />
      ) : null}

      {state.status === 'loading' ? <LoadingBlock rows={2} /> : null}
      {state.status === 'error' ? <LoadError onRetry={reload} /> : null}
      {state.status === 'ready' && state.data.length === 0 && editing === null ? (
        <p className="text-ink-secondary">{t('empty')}</p>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {state.data.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-4 rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset"
            >
              <div>
                {renaming?.id === entry.id ? (
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const label = renaming.label.trim();
                      if (!label) return;
                      setRenaming(null);
                      void act(
                        entry.id,
                        () => accountApi.renamePrescription(entry.id, label),
                        t('saved'),
                      );
                    }}
                  >
                    <TextField
                      id={`rename-${entry.id}`}
                      label={t('renameLabel')}
                      value={renaming.label}
                      maxLength={60}
                      className="flex-1"
                      onChange={(event) => {
                        setRenaming({ id: entry.id, label: event.target.value });
                      }}
                    />
                    <Button type="submit">{t('save')}</Button>
                  </form>
                ) : (
                  <h2 className="text-title font-semibold">{entry.label}</h2>
                )}
                <p className="mt-1 text-caption text-ink-secondary">
                  {t('version', { version: entry.version })} ·{' '}
                  {t('updated', {
                    date: format.dateTime(new Date(entry.createdAt), { dateStyle: 'medium' }),
                  })}
                  {entry.history.length
                    ? ` · ${t('history', { count: entry.history.length })}`
                    : ''}
                </p>
                <p
                  className={cn(
                    'mt-2 inline-flex rounded-pill px-2.5 py-0.5 text-caption font-medium',
                    entry.expiry === 'expired' || entry.expiry === 'expiring'
                      ? 'bg-warning/12 text-warning-ink'
                      : 'bg-surface-muted text-ink-secondary',
                  )}
                >
                  {entry.expiresAt
                    ? t(`expiry.${entry.expiry === 'unknown' ? 'valid' : entry.expiry}`, {
                        date: date(entry.expiresAt),
                      })
                    : t('expiry.unknown')}
                </p>
                <p className="mt-1 text-caption text-ink-secondary">
                  {t(`status.${entry.status}`)}
                </p>
              </div>
              <RxTable entry={entry} />
              {entry.previewUrl ? (
                <a
                  href={entry.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-caption text-accent underline-offset-4 hover:underline"
                >
                  {t('file')}
                </a>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(entry);
                  }}
                >
                  {t('edit')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRenaming({ id: entry.id, label: entry.label });
                  }}
                >
                  {t('rename')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy === entry.id}
                  aria-expanded={confirming === entry.id}
                  onClick={() => {
                    setConfirming(confirming === entry.id ? null : entry.id);
                  }}
                >
                  {t('remove')}
                </Button>
                {confirming === entry.id ? (
                  <div role="group" className="w-full space-y-3 rounded-card bg-surface-muted p-4">
                    <p className="text-caption">{t('removeConfirm', { label: entry.label })}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setConfirming(null);
                          void act(
                            entry.id,
                            () => accountApi.removePrescription(entry.id),
                            t('removed'),
                          );
                        }}
                      >
                        {t('remove')}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setConfirming(null);
                        }}
                      >
                        {t('cancel')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
