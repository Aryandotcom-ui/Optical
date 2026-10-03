import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('@mediapipe/tasks-vision'));

/**
 * MediaPipe's web runtime batches usage logs and POSTs them to Google
 * every minute. Try-on promises nothing leaves the device, so
 * patches/@mediapipe__tasks-vision@1.0.1.patch turns the logger off where
 * it is created. This fails if an upgrade drops or no longer matches it.
 */
describe('MediaPipe usage logging patch', () => {
  for (const file of ['vision_bundle.mjs', 'vision_bundle.cjs', 'vision_bundle.js']) {
    it(`is applied to ${file}`, () => {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).toContain('Usage logging is turned off');
      expect(source).not.toContain('setInterval(()=>{this.flush()},6e4)');
    });
  }
});
