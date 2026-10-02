'use client';

import { rxLimits, type EyeRx, type RxIssue } from '@optical/shared/lens/engine';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Disclosure } from '@/components/ui/disclosure';
import { cn } from '@/lib/cn';
import type { RxDraft } from './lens-draft';
import { formatDioptres, RxStepper } from './rx-stepper';

const mm = (value: number) => `${value} mm`;

/** Typing in a prescription: SPH, CYL, AXIS (and ADD for progressives) per eye, then PD. */
export function RxEntry({
  rx,
  onChange,
  requiresAdd,
  issues,
}: {
  rx: RxDraft;
  onChange: (rx: RxDraft) => void;
  requiresAdd: boolean;
  issues: RxIssue[];
}) {
  const t = useTranslations('configurator.rx');
  const id = useId();
  const issuesId = `${id}-issues`;
  const hasIssue = (path: string) =>
    issues.some((issue) => issue.path === path && issue.severity === 'error');
  const setEye = (side: 'right' | 'left', patch: Partial<EyeRx>) => {
    onChange({ ...rx, [side]: { ...rx[side], ...patch } });
  };
  const stepperLabels = (field: string) => ({
    decrementLabel: t('decrease', { field }),
    incrementLabel: t('increase', { field }),
  });

  const eyeRow = (side: 'right' | 'left') => {
    const eye = rx[side];
    const name = side === 'right' ? t('rightEye') : t('leftEye');
    const field = (key: 'sph' | 'cyl' | 'axis' | 'add') => `${t(key)}, ${name}`;
    return (
      <fieldset key={side} className="rounded-card bg-surface-muted p-4">
        <legend className="sr-only">{name}</legend>
        <p aria-hidden="true" className="mb-3 font-medium">
          {name}{' '}
          <span className="text-caption font-normal text-ink-secondary">
            {side === 'right' ? 'OD' : 'OS'}
          </span>
        </p>
        <div
          className={cn(
            'grid grid-cols-2 gap-3',
            requiresAdd ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
          )}
        >
          <RxStepper
            id={`${id}-${side}-sph`}
            label={t('sph')}
            value={eye.sph}
            onChange={(value) => {
              setEye(side, { sph: value ?? 0 });
            }}
            {...rxLimits.sph}
            start={0}
            format={formatDioptres}
            invalid={hasIssue(`${side}.sph`)}
            describedBy={issuesId}
            {...stepperLabels(field('sph'))}
          />
          <RxStepper
            id={`${id}-${side}-cyl`}
            label={t('cyl')}
            value={eye.cyl}
            onChange={(value) => {
              setEye(side, {
                cyl: value === 0 ? null : value,
                ...(value === null || value === 0 ? { axis: null } : {}),
              });
            }}
            {...rxLimits.cyl}
            start={-0.25}
            format={formatDioptres}
            allowEmpty
            emptyLabel={t('none')}
            invalid={hasIssue(`${side}.cyl`)}
            describedBy={issuesId}
            {...stepperLabels(field('cyl'))}
          />
          <RxStepper
            id={`${id}-${side}-axis`}
            label={t('axis')}
            value={eye.axis}
            onChange={(value) => {
              setEye(side, { axis: value === null ? null : Math.round(value) });
            }}
            {...rxLimits.axis}
            start={90}
            format={(value) => `${value}°`}
            allowEmpty
            emptyLabel={t('none')}
            invalid={hasIssue(`${side}.axis`)}
            describedBy={issuesId}
            {...stepperLabels(field('axis'))}
          />
          {requiresAdd ? (
            <RxStepper
              id={`${id}-${side}-add`}
              label={t('add')}
              value={eye.add}
              onChange={(value) => {
                setEye(side, { add: value });
              }}
              {...rxLimits.add}
              start={1.5}
              format={formatDioptres}
              allowEmpty
              emptyLabel={t('none')}
              invalid={hasIssue(`${side}.add`)}
              describedBy={issuesId}
              {...stepperLabels(field('add'))}
            />
          ) : null}
        </div>
      </fieldset>
    );
  };

  return (
    <div className="space-y-4">
      {eyeRow('right')}
      {eyeRow('left')}

      <fieldset className="rounded-card bg-surface-muted p-4">
        <legend className="sr-only">{t('pdTitle')}</legend>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-hidden="true" className="font-medium">
            {t('pdTitle')}
          </p>
          <div className="flex gap-1 rounded-pill bg-surface p-1 ring-1 ring-hairline ring-inset">
            {(['single', 'dual'] as const).map((kind) => (
              <label
                key={kind}
                className="inline-flex min-h-9 cursor-pointer items-center rounded-pill px-3 text-caption font-medium has-[:checked]:bg-ink has-[:checked]:text-background has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="radio"
                  name={`${id}-pd-kind`}
                  className="sr-only"
                  checked={rx.pdKind === kind}
                  onChange={() => {
                    onChange({ ...rx, pdKind: kind });
                  }}
                />
                {t(kind === 'single' ? 'pdSingle' : 'pdDual')}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rx.pdKind === 'single' ? (
            <RxStepper
              id={`${id}-pd`}
              label={t('pd')}
              value={rx.pd}
              onChange={(value) => {
                onChange({ ...rx, pd: value });
              }}
              {...rxLimits.pd}
              start={63}
              format={mm}
              allowEmpty
              emptyLabel={t('pdEmpty')}
              invalid={hasIssue('pd.value')}
              describedBy={issuesId}
              {...stepperLabels(t('pd'))}
            />
          ) : (
            (['pdRight', 'pdLeft'] as const).map((key) => (
              <RxStepper
                key={key}
                id={`${id}-${key}`}
                label={t(key)}
                value={rx[key]}
                onChange={(value) => {
                  onChange({ ...rx, [key]: value });
                }}
                {...rxLimits.monoPd}
                start={31.5}
                format={mm}
                allowEmpty
                emptyLabel={t('pdEmpty')}
                invalid={hasIssue(key === 'pdRight' ? 'pd.right' : 'pd.left')}
                describedBy={issuesId}
                {...stepperLabels(t(key))}
              />
            ))
          )}
        </div>
      </fieldset>

      <div id={issuesId} aria-live="polite" className="space-y-1 text-caption">
        {issues.map((issue) => (
          <p
            key={`${issue.path}-${issue.message}`}
            className={issue.severity === 'error' ? 'text-danger-ink' : 'text-warning-ink'}
          >
            {issue.message}
          </p>
        ))}
      </div>

      <Disclosure summary={t('whatMeanTitle')} className="text-body">
        <dl className="space-y-2 text-caption">
          {(['sphHelp', 'cylHelp', 'axisHelp', 'addHelp', 'pdHelp'] as const).map((key) => (
            <div key={key}>
              <dt className="font-medium text-ink">{t(`${key}Term`)}</dt>
              <dd>{t(key)}</dd>
            </div>
          ))}
        </dl>
      </Disclosure>
      <Disclosure summary={t('measureTitle')} className="text-body">
        <ol className="list-decimal space-y-1 pl-5 text-caption">
          <li>{t('measureStep1')}</li>
          <li>{t('measureStep2')}</li>
          <li>{t('measureStep3')}</li>
        </ol>
      </Disclosure>
    </div>
  );
}
