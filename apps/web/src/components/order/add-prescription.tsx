'use client';

import type { OrderView } from '@optical/shared/checkout';
import { hasBlockingIssues, validatePrescription } from '@optical/shared/lens/engine';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { emptyDraft, draftPrescription, type RxDraft } from '@/components/configurator/lens-draft';
import { PrescriptionUpload } from '@/components/configurator/prescription-step';
import { RxEntry } from '@/components/configurator/rx-entry';
import { Button } from '@/components/ui/button';
import { CommerceError, commerceApi } from '@/lib/commerce-api';

/** "We still need your prescription": upload a photo or type the values in, for one item. */
export function AddPrescription({
  number,
  token,
  item,
  requiresAdd,
  onAdded,
}: {
  number: string;
  token: string;
  item: OrderView['items'][number];
  requiresAdd: boolean;
  onAdded: (order: OrderView) => void;
}) {
  const t = useTranslations('order.prescription');
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [rx, setRx] = useState<RxDraft>(emptyDraft.rx);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prescription = draftPrescription(rx);
  const issues = prescription ? validatePrescription(prescription, { requiresAdd }) : [];

  const attach = async (source: Parameters<typeof commerceApi.attachPrescription>[2]['source']) => {
    setBusy(true);
    setError(null);
    try {
      onAdded(await commerceApi.attachPrescription(number, token, { itemId: item.id, source }));
    } catch (problem) {
      setError(problem instanceof CommerceError ? problem.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset">
      <p className="font-medium">{t('for', { name: item.productName, colour: item.colourName })}</p>
      <fieldset className="mt-3">
        <legend className="sr-only">{t('how')}</legend>
        <div className="flex gap-1 rounded-pill bg-surface-muted p-1">
          {(['upload', 'manual'] as const).map((option) => (
            <label
              key={option}
              className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-pill text-caption font-medium text-ink-secondary has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name={`rx-${item.id}`}
                className="sr-only"
                checked={mode === option}
                onChange={() => {
                  setMode(option);
                }}
              />
              {t(option)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4">
        {mode === 'upload' ? (
          <PrescriptionUpload
            upload={null}
            onUploaded={(upload) => void attach({ mode: 'upload', uploadId: upload.id })}
          />
        ) : (
          <div className="space-y-4">
            <RxEntry rx={rx} onChange={setRx} requiresAdd={requiresAdd} issues={issues} />
            <Button
              disabled={busy || !prescription || hasBlockingIssues(issues)}
              onClick={() => {
                if (prescription) void attach({ mode: 'manual', rx: prescription });
              }}
            >
              {t('save')}
            </Button>
          </div>
        )}
      </div>
      <p aria-live="polite" className="mt-2 text-caption text-danger-ink">
        {error}
      </p>
    </div>
  );
}
