'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Slide-over panel (drawer) and centred dialog, built on Radix Dialog for
 * focus trapping, Escape to close and scroll locking.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sides = {
  right:
    'inset-y-0 right-0 h-dvh w-full max-w-md data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right',
  bottom:
    'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-media pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom',
  center:
    'top-1/2 left-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card data-[state=open]:animate-fade-in',
} as const;

export interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  side?: keyof typeof sides;
  title: string;
  /** Visually hide the title (it is still announced). */
  hideTitle?: boolean;
  description?: string;
  footer?: ReactNode;
  closeLabel: string;
}

export function SheetContent({
  side = 'right',
  title,
  hideTitle,
  description,
  footer,
  closeLabel,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col bg-surface text-ink shadow-overlay outline-none',
          sides[side],
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3">
          <DialogPrimitive.Title
            className={cn('text-headline font-semibold', hideTitle && 'sr-only')}
          >
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-pill text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink"
            aria-label={closeLabel}
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        {description ? (
          <DialogPrimitive.Description className="px-5 text-ink-secondary">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>
        {footer ? <div className="border-t border-hairline px-5 py-4">{footer}</div> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
