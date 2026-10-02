'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { SheetDialogProps } from './sheet-dialog';

const SheetDialog = dynamic(() => import('./sheet-dialog'), { ssr: false });

/**
 * A sheet whose dialog code (Radix Dialog, focus trap, scroll lock) is only
 * downloaded the first time it opens. Pair it with a plain button that sets
 * `open` and pass that button as `returnFocusTo`, so focus goes back to it on
 * close. Once opened it stays mounted so the closing animation can play.
 */
export function LazySheet(props: SheetDialogProps) {
  const [opened, setOpened] = useState(props.open);
  if (props.open && !opened) setOpened(true);
  return opened ? <SheetDialog {...props} /> : null;
}
