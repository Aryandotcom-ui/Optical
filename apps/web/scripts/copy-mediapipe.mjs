/* eslint-disable no-console -- a build step that reports what it did */
/**
 * Puts the on-device face tracking runtime where the browser loads it:
 * the MediaPipe WASM files are copied from the installed
 * `@mediapipe/tasks-vision` package into `public/mediapipe/wasm`, and the
 * vendored face model (committed in `public/mediapipe`) is checked against
 * its known checksum. Runs as part of `dev`, `build` and `start` (pnpm skips
 * pre-scripts, so they call it directly); needs no network.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'mediapipe');
const MODEL = 'face_landmarker.task';
const MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

// The package exports its WASM files (not package.json), so locate the folder through one.
const wasmDir = dirname(
  createRequire(import.meta.url).resolve('@mediapipe/tasks-vision/vision_wasm_internal.wasm'),
);
mkdirSync(join(target, 'wasm'), { recursive: true });
let copied = 0;
for (const file of FILES) {
  const from = join(wasmDir, file);
  const to = join(target, 'wasm', file);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied += 1;
}

const model = join(target, MODEL);
if (!existsSync(model)) {
  console.error(`Missing ${model}. It is committed to the repository; restore it with git.`);
  process.exit(1);
}
const digest = createHash('sha256').update(readFileSync(model)).digest('hex');
if (digest !== MODEL_SHA256) {
  console.error(`${MODEL} does not match its checksum; restore it with git.`);
  process.exit(1);
}
if (copied) console.log(`MediaPipe: copied ${copied} runtime file(s) to public/mediapipe/wasm.`);
