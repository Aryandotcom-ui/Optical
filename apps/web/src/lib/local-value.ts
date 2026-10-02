'use client';

import { useSyncExternalStore } from 'react';

/**
 * A small value kept in this browser's localStorage, readable as a React
 * hook. The server render (and the first client render) sees the fallback,
 * so hydration never mismatches; the stored value takes over straight after.
 * Storage can be missing or blocked (private mode), so every access is
 * guarded and the value then lasts only until the page is closed.
 */
export interface LocalValue<T> {
  useValue: () => T;
  get: () => T;
  set: (value: T) => void;
}

export function createLocalValue<T>(
  key: string,
  parse: (raw: unknown) => T | null,
  fallback: T,
): LocalValue<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null = null;
  let cachedValue: T = fallback;
  // Used when storage is blocked, so the value still lasts for this page view.
  let memory: T = fallback;

  const get = (): T => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return memory;
    }
    // Same string, same object: useSyncExternalStore needs a stable snapshot.
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    try {
      cachedValue = raw === null ? fallback : (parse(JSON.parse(raw)) ?? fallback);
    } catch {
      cachedValue = fallback;
    }
    return cachedValue;
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  };

  return {
    get,
    set: (value) => {
      memory = value;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Not remembered; the current page still works.
      }
      notify();
    },
    useValue: () => useSyncExternalStore(subscribe, get, () => fallback),
  };
}
