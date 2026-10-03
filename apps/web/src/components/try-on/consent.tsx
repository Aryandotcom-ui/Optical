'use client';

import { Camera, ImageUp, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { TryOnProblem } from './engine/controller';

/** Asks for nothing until the customer chooses: camera, or a photo that stays on the device. */
export function PhotoPicker({
  onPhoto,
  variant = 'secondary',
  label,
}: {
  onPhoto: (file: File) => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPhoto(file);
          event.target.value = '';
        }}
      />
      <Button variant={variant} onClick={() => input.current?.click()}>
        <ImageUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {label}
      </Button>
    </>
  );
}

/** The pre-permission screen: what happens to the camera image, before the browser asks. */
export function Consent({
  onStart,
  onPhoto,
}: {
  onStart: () => void;
  onPhoto: (file: File) => void;
}) {
  const t = useTranslations('tryOn.consent');
  return (
    <div className="mx-auto max-w-lg space-y-6 py-6 text-center">
      <ShieldCheck aria-hidden="true" className="mx-auto size-10 text-accent" strokeWidth={1.5} />
      <div className="space-y-2">
        <h2 className="text-title font-semibold">{t('title')}</h2>
        <p className="text-ink-secondary">{t('body')}</p>
      </div>
      <ul className="space-y-2 text-left text-caption text-ink-secondary">
        {(['local', 'nothing', 'off'] as const).map((key) => (
          <li key={key} className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-accent" />
            {t(`points.${key}`)}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={onStart}>
          <Camera aria-hidden="true" className="size-5" strokeWidth={1.5} />
          {t('start')}
        </Button>
        <PhotoPicker onPhoto={onPhoto} label={t('photo')} />
      </div>
      <p className="text-caption text-ink-secondary">{t('photoHint')}</p>
    </div>
  );
}

/** Every way try-on can fail, each with a way forward. */
export function Problem({
  problem,
  onRetry,
  onPhoto,
}: {
  problem: TryOnProblem;
  onRetry: () => void;
  onPhoto: (file: File) => void;
}) {
  const t = useTranslations('tryOn');
  const drawing = problem === 'webgl' || problem === 'tracker';
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-4 py-6 text-center">
      <h2 className="text-title font-semibold">{t(`errors.${problem}.title`)}</h2>
      <p className="text-ink-secondary">{t(`errors.${problem}.body`)}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {problem !== 'webgl' ? (
          <Button onClick={onRetry} variant={drawing ? 'primary' : 'secondary'}>
            {t('retry')}
          </Button>
        ) : null}
        {drawing ? (
          <Button asChild variant="secondary">
            <Link href="/shop">{t('browse')}</Link>
          </Button>
        ) : (
          <PhotoPicker onPhoto={onPhoto} variant="primary" label={t('consent.photo')} />
        )}
      </div>
    </div>
  );
}
