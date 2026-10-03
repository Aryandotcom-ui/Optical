'use client';

import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from 'next-intl';
import { useMemo, type ReactNode } from 'react';

type Messages = ReturnType<typeof useMessages>;

/**
 * Adds message namespaces for one part of the page to the ones the root
 * layout sends to every page, so strings for the configurator or checkout
 * reach the browser only where they're used.
 */
export function ExtraMessages({
  messages,
  children,
}: {
  messages: Partial<Messages>;
  children: ReactNode;
}) {
  const parent = useMessages();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const merged = useMemo(() => ({ ...parent, ...messages }), [parent, messages]);
  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
