/* eslint-disable no-console -- a measuring tool whose output is the point */
/**
 * Measures try-on's frame rate: the whole loop (track, smooth, draw), as
 * the page itself reports it in `data-fps`, over 15 seconds after a 5 s
 * warm-up. Uses Chromium's fake camera playing the e2e test face, so it
 * runs anywhere; on a machine with a GPU, pass --gpu to use it instead of
 * SwiftShader.
 *
 *   node scripts/measure-try-on.mts [base-url] [--mobile] [--gpu] [--cpu-slowdown=4]
 *
 * --mobile emulates a Pixel 7 screen; --cpu-slowdown throttles the CPU
 * through DevTools, a rough stand-in for a mid-range phone.
 */
import { chromium, devices } from '@playwright/test';
import { ensureFakeCamera } from '../e2e/fake-camera.ts';

const args = process.argv.slice(2);
const base = (args.find((arg) => !arg.startsWith('--')) ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
const mobile = args.includes('--mobile');
const gpu = args.includes('--gpu');
const slowdown = Number(/--cpu-slowdown=(\d+)/.exec(args.join(' '))?.[1] ?? 1);

const video = await ensureFakeCamera();
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${video}`,
    ...(gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader']),
  ],
});
try {
  const context = await browser.newContext({
    permissions: ['camera'],
    ...(mobile ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } }),
  });
  const page = await context.newPage();
  if (slowdown > 1) {
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
  }
  await page.goto(`${base}/try-on?frames=harbour,marlow&frame=harbour`);
  await page.getByRole('button', { name: 'Start camera' }).click();
  const root = page.locator('[data-try-on-phase]');
  await root.and(page.locator('[data-tracking="face"]')).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(5_000);

  const samples: number[] = [];
  for (let second = 0; second < 15; second += 1) {
    await page.waitForTimeout(1_000);
    samples.push(Number(await root.getAttribute('data-fps')));
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  console.log(
    JSON.stringify(
      {
        profile: mobile ? 'Pixel 7 screen' : '1280×800',
        cpuSlowdown: slowdown,
        renderer,
        delegate: await root.getAttribute('data-delegate'),
        quality: Number(await root.getAttribute('data-quality')),
        fps: { median, min: sorted[0], max: sorted.at(-1), samples },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
