'use client';

import { hasBlockingIssues, validatePrescription, type RxIssue } from '@optical/shared/lens/engine';
import type { SavedPrescription, SavedPrescriptionInput } from '@optical/shared/account';
import { useTranslations } from 'next-intl';
import { useState, type SyntheticEvent } from 'react';
import { TextField } from '@/components/checkout/fields';
import {
  draftPrescription,
  emptyDraft,
  rxDraftFrom,
  type RxDraft,
} from '@/components/configurator/lens-draft';
import { RxEntry } from '@/components/configurator/rx-entry';
import { Button } from '@/components/ui/button';
import { CommerceError } from '@/lib/account-api';

const DEFAULT_VALIDITY_MONTHS = 24;

/** New prescription, or a new version of one: name, values and dates. */
export function PrescriptionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SavedPrescription | null;
  onSave: (input: SavedPrescriptionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('account.prescriptions');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [rx, setRx] = useState<RxDraft>(
    initial?.values ? rxDraftFrom(initial.values) : emptyDraft.rx,
  );
  const [prescribedAt, setPrescribedAt] = useState(initial?.prescribedAt ?? '');
  const [expiresAt, setExpiresAt] = useState('');
  const [issues, setIssues] = useState<RxIssue[]>([]);
  const [labelError, setLabelError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = draftPrescription(rx);
    const found = values ? validatePrescription(values, { requiresAdd: false }) : [];
    setIssues(found);
    setLabelError(label.trim() ? undefined : t('labelHint'));
    if (!values) {
      setFormError(t('pdMissing'));
      return;
    }
    if (!label.trim() || hasBlockingIssues(found)) return;
    setSaving(true);
    setFormError(null);
    try {
      await onSave({
        label: label.trim(),
        rx: values,
        prescribedAt: prescribedAt || null,
        expiresAt: expiresAt || null,
      });
    } catch (error) {
      setFormError(error instanceof CommerceError ? error.message : t('failed'));
    } finally {
      setSaving(false);
    }
  };

  const blocking = issues.filter((issue) => issue.severity === 'error');
  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-labelledby="rx-form-title"
      className="space-y-5 rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset sm:p-6"
    >
      <h2 id="rx-form-title" className="text-title font-semibold">
        {initial ? t('editTitle', { label: initial.label }) : t('addTitle')}
      </h2>
      <TextField
        id="rx-label"
        label={t('label')}
        hint={t('labelHint')}
        value={label}
        maxLength={60}
        error={labelError}
        onChange={(event) => {
          setLabel(event.target.value);
        }}
      />
      <RxEntry rx={rx} onChange={setRx} requiresAdd issues={issues} />
      {blocking.length ? (
        <ul role="alert" className="space-y-1 text-caption text-danger-ink">
          {blocking.map((issue) => (
            <li key={issue.path}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="rx-prescribed"
          label={t('prescribedAt')}
          type="date"
          value={prescribedAt}
          onChange={(event) => {
            setPrescribedAt(event.target.value);
          }}
        />
        <TextField
          id="rx-expires"
          label={t('expiresAt')}
          type="date"
          value={expiresAt}
          hint={t('expiresHint', { months: DEFAULT_VALIDITY_MONTHS })}
          onChange={(event) => {
            setExpiresAt(event.target.value);
          }}
        />
      </div>
      <p role="alert" className="text-caption text-danger-ink empty:hidden">
        {formError}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
