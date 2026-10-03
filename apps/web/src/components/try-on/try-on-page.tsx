'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTryOn } from '@/stores/try-on';

// three.js and MediaPipe load after the page itself.
const TryOnExperience = dynamic(() => import('./try-on-experience'), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full rounded-media" />,
});

/** The standalone /try-on page body. Frames from the URL join the session. */
export function TryOnPage({ frames, frame }: { frames: string[]; frame: string | undefined }) {
  const open = useTryOn((state) => state.open);
  const key = frames.join(',');
  useEffect(() => {
    if (key) open(key.split(','), frame);
  }, [key, frame, open]);
  return <TryOnExperience />;
}
