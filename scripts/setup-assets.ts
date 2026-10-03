/**
 * Prepares generated assets: `pnpm setup:assets [--skip-render]`.
 *
 * 1. Makes sure a Chromium binary is available for rendering (downloads
 *    one through Playwright if none is found; needs network once).
 * 2. Renders product images from the seeded catalogue.
 *
 * MediaPipe models for try-on are vendored in the repository (Phase 5).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { findChromium } from './render-product-images/chromium';
import { loadRootEnv } from './root-env';

loadRootEnv();

function run(command: string, args: string[]): boolean {
  return spawnSync(command, args, { stdio: 'inherit' }).status === 0;
}

let chromium = findChromium();
if (!chromium) {
  console.log('No Chromium found; downloading one for image rendering (about 150 MB, once).');
  const cli = join(
    dirname(createRequire(import.meta.url).resolve('playwright-core/package.json')),
    'cli.js',
  );
  if (!run(process.execPath, [cli, 'install', 'chromium'])) {
    console.error(
      'Could not download Chromium. Set CHROMIUM_PATH to an existing Chrome or Chromium and re-run.',
    );
    process.exit(1);
  }
  chromium = findChromium();
}
console.log(`Chromium: ${chromium ?? 'not found'}`);

if (!process.argv.includes('--skip-render')) {
  const tsx = createRequire(import.meta.url).resolve('tsx/cli');
  if (!run(process.execPath, [tsx, 'render-product-images/index.ts'])) process.exit(1);
}
