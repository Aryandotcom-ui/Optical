'use client';

import { FileCheck2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { CommerceError, commerceApi } from '@/lib/commerce-api';
import dynamic from 'next/dynamic';
import { useSignedInHint } from '@/lib/signed-in';
import { OptionCard } from './option-card';
import { RecommendButton } from './recommend-button';
import { RxEntry } from './rx-entry';
import type { StepProps } from './step-props';

const SavedPrescriptionPicker = dynamic(() =>
  import('./saved-prescriptions').then((module) => module.SavedPrescriptionPicker),
);

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Upload a photo or PDF; the file is checked and cleaned by the API. */
export function PrescriptionUpload({
  upload,
  onUploaded,
}: {
  upload: { id: string; name: string } | null;
  onUploaded: (upload: { id: string; name: string }) => void;
}) {
  const t = useTranslations('configurator.upload');
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    { status: 'idle' | 'uploading' } | { status: 'error'; message: string }
  >({
    status: 'idle',
  });
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setState({ status: 'error', message: t('tooLarge') });
      return;
    }
    setState({ status: 'uploading' });
    try {
      const uploaded = await commerceApi.uploadPrescription(file);
      onUploaded({ id: uploaded.id, name: file.name });
      setState({ status: 'idle' });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof CommerceError ? error.message : t('failed'),
      });
    }
  };
  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label={t('choose')}
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {upload ? (
        <p className="flex items-center gap-2 text-caption">
          <FileCheck2 aria-hidden="true" className="size-4 text-success-ink" strokeWidth={1.5} />
          <span>{t('uploaded', { name: upload.name })}</span>
        </p>
      ) : null}
      <button
        type="button"
        disabled={state.status === 'uploading'}
        onClick={() => input.current?.click()}
        className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-surface px-4 font-medium ring-1 ring-hairline ring-inset hover:bg-surface-muted disabled:opacity-50"
      >
        <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {state.status === 'uploading' ? t('uploading') : upload ? t('replace') : t('choose')}
      </button>
      <p className="text-caption text-ink-secondary">{t('hint')}</p>
      <p aria-live="polite" className="text-caption text-danger-ink">
        {state.status === 'error' ? state.message : null}
      </p>
    </div>
  );
}

export function PrescriptionStep({ catalog, draft, evaluation, update }: StepProps) {
  const t = useTranslations('configurator.prescription');
  const tSaved = useTranslations('configurator.saved');
  const signedIn = useSignedInHint();
  const purpose = catalog.purposes.find((option) => option.code === draft.purpose);
  const modes = ['manual', 'upload', 'later'] as const;
  return (
    <div className="space-y-3">
      <fieldset className="space-y-3">
        <legend className="sr-only">{t('legend')}</legend>
        {signedIn ? (
          <OptionCard
            type="radio"
            name="rx-mode"
            value="saved"
            checked={draft.rxMode === 'saved'}
            onChange={() => {
              update({ rxMode: 'saved' });
            }}
            title={tSaved('title')}
            description={tSaved('description')}
          >
            <SavedPrescriptionPicker
              draft={draft}
              onPick={(patch) => {
                update({ ...patch, rxMode: 'saved' });
              }}
            />
            {draft.rxMode === 'saved' && evaluation.rxIssues.length > 0 ? (
              <ul className="mt-2 space-y-1 text-caption text-danger-ink">
                {evaluation.rxIssues
                  .filter((issue) => issue.severity === 'error')
                  .map((issue) => (
                    <li key={issue.path}>{issue.message}</li>
                  ))}
              </ul>
            ) : null}
          </OptionCard>
        ) : null}
        {modes.map((mode) => (
          <OptionCard
            key={mode}
            type="radio"
            name="rx-mode"
            value={mode}
            checked={draft.rxMode === mode}
            onChange={() => {
              update({ rxMode: mode });
            }}
            title={t(`${mode}Title`)}
            description={t(`${mode}Description`)}
          >
            {mode === 'manual' ? (
              <RxEntry
                rx={draft.rx}
                requiresAdd={purpose?.requiresAdd ?? false}
                issues={evaluation.rxIssues}
                onChange={(rx) => {
                  update({ rx });
                }}
              />
            ) : mode === 'upload' ? (
              <PrescriptionUpload
                upload={draft.upload}
                onUploaded={(upload) => {
                  update({ upload });
                }}
              />
            ) : null}
          </OptionCard>
        ))}
      </fieldset>
      <RecommendButton
        label={t('recommend')}
        onClick={() => {
          update({ rxMode: 'later' });
        }}
      />
    </div>
  );
}
