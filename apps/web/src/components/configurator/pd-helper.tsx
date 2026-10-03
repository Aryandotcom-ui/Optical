'use client';

import { Camera } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// The camera, MediaPipe and the measuring flow load only when asked for.
const PdMeasure = dynamic(() => import('./pd-measure'), {
  ssr: false,
  loading: () => <Skeleton className="mt-4 h-64 w-full rounded-card" />,
});

/** "Measure my PD with the camera", under the PD field. */
export function PdHelper({ onMeasured }: { onMeasured: (pd: number) => void }) {
  const t = useTranslations('configurator.pdHelper');
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <PdMeasure
        onUse={(pd) => {
          onMeasured(pd);
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
        }}
      />
    );
  return (
    <Button
      variant="secondary"
      className="mt-3"
      onClick={() => {
        setOpen(true);
      }}
    >
      <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('open')}
    </Button>
  );
}
