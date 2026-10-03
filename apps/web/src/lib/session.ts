'use client';

import type { User } from '@optical/shared/account';
import { useEffect, useSyncExternalStore } from 'react';
import { call } from './bag-api';
import { hasSignedInHint, signedInChanged } from './signed-in';

export type SessionState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: User };

const LOADING: SessionState = { status: 'loading' };
let state: SessionState = LOADING;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  for (const listener of listeners) listener();
  signedInChanged();
}

/** Asks the API who is signed in, once per page load (guests skip the request). */
export function loadSession(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    if (!hasSignedInHint()) {
      set({ status: 'signed-out' });
      return;
    }
    try {
      set({ status: 'signed-in', user: await call<User>('GET', '/v1/auth/me') });
    } catch {
      // Expired and not refreshable (or offline): treat as signed out.
      set({ status: 'signed-out' });
    }
  })();
  return loading;
}

export function setSignedIn(user: User): void {
  loading = Promise.resolve();
  set({ status: 'signed-in', user });
}

export function setSignedOut(): void {
  loading = Promise.resolve();
  set({ status: 'signed-out' });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in customer, loading it on first use. */
export function useSession(): SessionState {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
  useEffect(() => {
    void loadSession();
  }, []);
  return current;
}
