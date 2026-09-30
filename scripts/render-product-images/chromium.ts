import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * Finds a Chromium binary: CHROMIUM_PATH, then Playwright's own install
 * (`pnpm setup:assets` downloads one), then pre-installed Playwright
 * browsers under PLAYWRIGHT_BROWSERS_PATH.
 */
export function findChromium(): string | null {
  const fromEnv = process.env.CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  try {
    const bundled = chromium.executablePath();
    if (existsSync(bundled)) return bundled;
  } catch {
    // Not installed through Playwright; keep looking.
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(root)) {
    for (const entry of readdirSync(root)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse()) {
      for (const candidate of [
        'chrome-linux/chrome',
        'chrome-linux64/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
        'chrome-win/chrome.exe',
      ]) {
        const path = join(root, entry, candidate);
        if (existsSync(path)) return path;
      }
    }
  }
  return null;
}

/** Flags that give headless Chromium a software WebGL context on any machine. */
export const SOFTWARE_WEBGL_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
