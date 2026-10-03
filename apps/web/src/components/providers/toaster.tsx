'use client';

import { useEffect } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { toasterMounted } from '@/lib/notify';

/** The toast viewport. Loaded lazily by Providers; see lib/notify.ts. */
export default function Toaster() {
  // Runs after the toaster's own effects, so it is subscribed by now.
  useEffect(() => {
    toasterMounted();
  }, []);
  return <SonnerToaster position="bottom-center" toastOptions={{ className: 'toast' }} />;
}
