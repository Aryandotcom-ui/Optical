'use client';

import dynamic from 'next/dynamic';
import { startTransition, useEffect, useState, type ReactNode } from 'react';
import { onToasterRequested } from '@/lib/notify';

const Toaster = dynamic(() => import('./toaster'), { ssr: false });

/** App-wide client providers: the toast viewport, mounted on the first toast. */
export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState(false);
  useEffect(() => {
    onToasterRequested(() => {
      // Mounting the toaster is not part of the click that asked for it.
      startTransition(() => {
        setToasts(true);
      });
    });
  }, []);
  return (
    <>
      {children}
      {toasts ? <Toaster /> : null}
    </>
  );
}
