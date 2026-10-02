/* eslint-disable no-console -- a CLI check whose output is the point */
/**
 * Checks the initial JavaScript budget: the gzipped size of the module
 * scripts each page's HTML loads up front. Prefetches for linked pages and
 * code loaded on interaction (3D viewer, search palette, toasts) are not
 * initial, so they don't count.
 *
 *   node scripts/check-js-budget.mjs [baseUrl]   (default http://localhost:3000)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 170;
const PAGES = [
  '/',
  '/shop',
  '/shop/sunglasses',
  '/collections/featherweight',
  '/search?q=round',
  '/p/harbour',
  '/wishlist',
  '/compare',
  '/help',
  '/help/size-guide',
  '/legal/privacy',
  '/cart',
  '/checkout',
  '/track',
  '/order/LO-26-001001',
];

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');
const nextDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.next');
const gzipped = new Map();

function gzippedKb(src) {
  if (!gzipped.has(src)) {
    const file = join(nextDir, src.replace(/^\/_next\//, ''));
    gzipped.set(src, gzipSync(readFileSync(file)).length / 1024);
  }
  return gzipped.get(src);
}

let failed = false;
for (const page of PAGES) {
  const response = await fetch(`${base}${page}`);
  if (!response.ok) throw new Error(`${page} returned ${response.status}`);
  const html = await response.text();
  const scripts = new Set(
    [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)]
      .filter((match) => !/\bnoModule\b/i.test(match[0]))
      .map((match) => match[1].split('?')[0]),
  );
  const total = [...scripts].reduce((sum, src) => sum + gzippedKb(src), 0);
  const over = total > BUDGET_KB;
  failed ||= over;
  console.log(
    `${over ? '✗' : '✓'} ${page.padEnd(28)} ${total.toFixed(1).padStart(6)} KB in ${scripts.size} scripts`,
  );
}
console.log(`\nBudget: ${BUDGET_KB} KB gzipped initial JavaScript per page.`);
if (failed) process.exit(1);
