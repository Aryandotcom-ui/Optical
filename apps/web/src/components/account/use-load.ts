'use client';

import { useCallback, useEffect, useState } from 'react';

export type LoadState<T> =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** Loads account data once, with a retry and a way to replace it after a change. */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) setState({ status: 'ready', data });
      },
      () => {
        if (current) setState({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
    // `load` is a stable module function for each page; `attempt` asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);
  const set = useCallback((data: T) => {
    setState({ status: 'ready', data });
  }, []);
  return { state, reload, set };
}
