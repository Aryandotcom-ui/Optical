'use client';

import { useState } from 'react';
import { CommerceError } from '@/lib/bag-api';

export type FieldMessages = Record<string, string>;

/**
 * State for one form's request: pending flag, a message for the whole form
 * and per-field messages from the API's validation details.
 */
export function useRequest(fallback: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldMessages>({});

  async function run<T>(request: () => Promise<T>): Promise<T | undefined> {
    setPending(true);
    setError(null);
    setFields({});
    try {
      return await request();
    } catch (caught) {
      if (caught instanceof CommerceError) {
        setError(caught.message);
        setFields(
          Object.fromEntries(
            caught.details.map((detail) => [detail.path.split('.').at(-1) ?? '', detail.message]),
          ),
        );
      } else setError(fallback);
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, fields, run, setError, setFields };
}
