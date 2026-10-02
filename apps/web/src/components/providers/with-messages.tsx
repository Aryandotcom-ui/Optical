import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ExtraMessages } from './extra-messages';

type Namespace = keyof Awaited<ReturnType<typeof getMessages>>;

/** Sends extra message namespaces to client components below this point. */
export async function WithMessages({
  namespaces,
  children,
}: {
  namespaces: Namespace[];
  children: ReactNode;
}) {
  const messages = await getMessages();
  const picked = Object.fromEntries(
    namespaces.map((namespace) => [namespace, messages[namespace]]),
  );
  return <ExtraMessages messages={picked}>{children}</ExtraMessages>;
}
