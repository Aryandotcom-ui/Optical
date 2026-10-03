'use client';

import type { RefObject } from 'react';
import { Sheet, SheetContent, type SheetContentProps } from './sheet';

export interface SheetDialogProps extends Omit<SheetContentProps, 'open'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opens the sheet; focus goes back to it on close. */
  returnFocusTo: RefObject<HTMLElement | null>;
}

/** A controlled sheet: Radix Dialog root plus content. Loaded on demand by LazySheet. */
export default function SheetDialog({
  open,
  onOpenChange,
  returnFocusTo,
  children,
  ...content
}: SheetDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        {...content}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
