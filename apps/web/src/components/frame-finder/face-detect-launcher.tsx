'use client';

import type { FinderAnswers } from '@optical/shared/frame-finder';
import { Camera } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// The camera, MediaPipe and the measuring code load only when asked for.
const FaceShapeDetector = dynamic(() => import('./face-shape-detector'), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-card" />,
});

const subscribe = () => () => undefined;

/** "Detect from camera" under the face-shape choices. */
export function FaceDetectLauncher({ answers }: { answers: FinderAnswers }) {
  const t = useTranslations('frameFinder');
  const [open, setOpen] = useState(false);
  // The camera needs JavaScript; until it has loaded the button stays disabled.
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (open)
    return (
      <FaceShapeDetector
        answers={answers}
        onClose={() => {
          setOpen(false);
        }}
      />
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-muted p-4">
      <p className="max-w-prose text-caption text-ink-secondary">{t('detect.teaser')}</p>
      <Button
        variant="secondary"
        disabled={!ready}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('steps.face.detect')}
      </Button>
    </div>
  );
}
