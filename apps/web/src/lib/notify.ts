'use client';

interface NotifyOptions {
  action?: { label: string; onClick: () => void };
}

let markReady: () => void = () => undefined;
const toasterReady = new Promise<void>((resolve) => {
  markReady = resolve;
});
let requestToaster: (() => void) | null = null;
let requested = false;

/** Providers registers how to mount the toaster; it mounts on the first toast. */
export function onToasterRequested(mount: () => void) {
  requestToaster = mount;
  if (requested) mount();
}

/** Called once the toaster is mounted and listening. */
export function toasterMounted() {
  markReady();
}

/**
 * Shows a brief confirmation. The toast library is downloaded the first time
 * one is shown (it isn't needed to render any page), so the first call waits
 * a moment for it.
 */
export async function notify(message: string, options?: NotifyOptions): Promise<void> {
  if (!requested) {
    requested = true;
    requestToaster?.();
  }
  const [{ toast }] = await Promise.all([import('sonner'), toasterReady]);
  toast(message, options);
}
