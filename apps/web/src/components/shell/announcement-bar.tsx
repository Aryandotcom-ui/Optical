'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export const ANNOUNCEMENT_COOKIE = 'announcement-dismissed';
/** Change when the message changes, so a new message shows again. */
export const ANNOUNCEMENT_VERSION = '1';

/**
 * The single, slim announcement bar. It scrolls away with the page (never
 * sticky), and dismissal is remembered in a cookie so the server doesn't
 * render it again: no flash, no layout shift.
 */
export function AnnouncementBar({ message }: { message: string }) {
  const t = useTranslations('shell');
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="relative flex min-h-9 items-center justify-center bg-ink px-12 py-2 text-center text-caption text-background">
      <p>{message}</p>
      <button
        type="button"
        onClick={() => {
          document.cookie = `${ANNOUNCEMENT_COOKIE}=${ANNOUNCEMENT_VERSION}; path=/; max-age=31536000; samesite=lax`;
          setVisible(false);
        }}
        aria-label={t('dismissAnnouncement')}
        className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-pill opacity-80 hover:opacity-100"
      >
        <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
