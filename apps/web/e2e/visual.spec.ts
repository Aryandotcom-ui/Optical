import { expect, test } from '@playwright/test';

/**
 * Visual regression baselines: calm pages at three widths in both themes.
 * Screenshots depend on the browser build and fonts, so they run in the
 * `visual` project only (`pnpm test:visual`), with baselines made on the
 * same machine type (TESTING.md). Moving parts (3D, the try-on drawing) are
 * left out, and motion is reduced so nothing is caught mid-animation.
 */
const pages = [
  { name: 'help', path: '/help' },
  { name: 'shipping-policy', path: '/legal/shipping' },
  { name: 'sign-in', path: '/sign-in' },
  { name: 'empty-bag', path: '/cart' },
  { name: 'not-found', path: '/not-a-page' },
];
const widths = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const colorScheme of ['light', 'dark'] as const) {
  for (const size of widths) {
    test.describe(`${colorScheme} ${size.name}`, () => {
      test.use({
        colorScheme,
        reducedMotion: 'reduce',
        viewport: { width: size.width, height: size.height },
      });
      for (const { name, path } of pages) {
        test(name, async ({ page }) => {
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          await page.evaluate(() => document.fonts.ready);
          await expect(page).toHaveScreenshot(`${name}-${colorScheme}-${size.name}.png`, {
            fullPage: true,
            animations: 'disabled',
            maxDiffPixelRatio: 0.01,
          });
        });
      }
    });
  }
}
