'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether this browser is signed in, from the API's readable `lo_auth`
 * hint cookie. It holds no secret (the real tokens are httpOnly); it only
 * lets the header say "Account" and lets pages skip a request for guests.
 */
const listeners = new Set<() => void>();

export function hasSignedInHint(): boolean {
  try {
    return document.cookie.split('; ').includes('lo_auth=1');
  } catch {
    return false;
  }
}

/** Call after signing in or out: the cookie changed without a page load. */
export function signedInChanged(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('focus', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('focus', listener);
  };
}

/** False on the server and the first client render, so markup always matches. */
export function useSignedInHint(): boolean {
  return useSyncExternalStore(subscribe, hasSignedInHint, () => false);
}
