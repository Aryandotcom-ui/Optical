import { expect, test, type Page, type Request } from '@playwright/test';
import { PORTRAIT } from './fake-camera';
import { expectNoAxeViolations } from './helpers';

/**
 * Try-on, face-shape detection and the PD helper, with Chromium's fake
 * camera playing a still of MediaPipe's own face test image (see
 * docs/ASSETS.md). Runs in the `camera` project only.
 */

// MediaPipe loads its WASM and model, then tracks on the CPU in CI: allow time.
const TRACKING = { timeout: 30_000 };
test.setTimeout(90_000);

/** Records every request that sends a body, to prove nothing leaves the tab. */
function watchUploads(page: Page): string[] {
  const uploads: string[] = [];
  page.on('request', (request: Request) => {
    if (request.method() !== 'GET' && request.method() !== 'HEAD')
      uploads.push(`${request.method()} ${request.url()}`);
  });
  return uploads;
}

// Everything below needs WebGL 2; say so plainly if the test browser lacks it.
test('the test browser draws WebGL 2 in software', async ({ page }) => {
  await page.goto('/try-on');
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown renderer';
  });
  expect(renderer, 'WebGL 2 is unavailable in the camera project browser').not.toBeNull();
});

/** Waits for a try-on phase, reporting the on-screen problem if it failed instead. */
async function expectPhase(page: Page, phase: 'live' | 'photo') {
  const experience = page.locator('[data-try-on-phase]').first();
  await expect(experience).not.toHaveAttribute('data-try-on-phase', /^(intro|starting)$/, TRACKING);
  if ((await experience.getAttribute('data-try-on-phase')) === 'error')
    throw new Error(
      `Try-on failed: ${(await page.getByRole('alert').allInnerTexts()).join(' | ')}`,
    );
  await expect(experience).toHaveAttribute('data-try-on-phase', phase);
}

test('try-on tracks the face, compares two frames and saves a photo, sending nothing', async ({
  page,
}) => {
  const uploads = watchUploads(page);
  await page.goto('/try-on?frames=harbour,marlow&frame=harbour');
  await page.getByRole('button', { name: 'Start camera' }).click();

  const experience = page.locator('[data-try-on-phase]');
  await expectPhase(page, 'live');
  await expect(experience).toHaveAttribute('data-tracking', 'face', TRACKING);
  await expect(page.getByText('Wearing Harbour')).toBeVisible();
  await expect(page.getByText(/^This frame (suits|runs slightly)/)).toBeVisible();

  // Arrow keys move through the carousel.
  const harbour = page.getByRole('radio', { name: 'Harbour' });
  await harbour.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Marlow' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Wearing Marlow')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(harbour).toHaveAttribute('aria-checked', 'true');

  // Split comparison with a keyboard-operable divider.
  await page.getByRole('button', { name: 'Compare with Marlow' }).click();
  const divider = page.getByRole('slider', { name: 'Comparison divider' });
  await expect(divider).toHaveAttribute('aria-valuenow', '50');
  await expectNoAxeViolations(page, 'live try-on with comparison');
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '55');
  await page.getByRole('button', { name: 'Stop comparing' }).click();
  await expect(divider).toBeHidden();

  const mirror = page.getByRole('button', { name: 'Mirror view' });
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');
  await mirror.click();
  await expect(mirror).toHaveAttribute('aria-pressed', 'false');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save a photo' }).click();
  expect((await download).suggestedFilename()).toMatch(/try-on-harbour\.png$/);

  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(experience).toHaveAttribute('data-try-on-phase', 'intro');
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();
  // The camera image and landmarks never left the page.
  expect(uploads).toEqual([]);
});

test('a denied camera offers a photo, and try-on works on the photo', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  const uploads = watchUploads(page);
  await page.goto('/try-on?frames=harbour&frame=harbour');
  await page.getByRole('button', { name: 'Start camera' }).click();
  const problem = page.getByRole('alert').filter({ hasText: 'Camera access is off' });
  await expect(problem).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(PORTRAIT);
  const experience = page.locator('[data-try-on-phase]');
  await expect(experience).toHaveAttribute('data-try-on-phase', 'photo', TRACKING);
  await expect(experience).toHaveAttribute('data-tracking', 'face');
  await expect(page.getByRole('img', { name: 'Your photo with Harbour' })).toBeVisible();
  expect(uploads).toEqual([]);
});

test('without WebGL, try-on explains why and points to the products', async ({ page }) => {
  // Runs in the page before any script: WebGL 2 reports as unavailable.
  await page.addInitScript(`
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return type === 'webgl2' ? null : original.call(this, type, ...rest);
    };
  `);
  await page.goto('/try-on?frames=harbour');
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Try-on needs 3D graphics' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse frames' })).toHaveAttribute('href', '/shop');
});

test('try-on opens over the product page and keeps the session', async ({ page }) => {
  await page.goto('/p/harbour');
  const trigger = page.getByRole('button', { name: 'Try on', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Try frames on' });
  await dialog.getByRole('button', { name: 'Start camera' }).click();
  await expectPhase(page, 'live');
  await expect(dialog.locator('[data-try-on-phase]')).toHaveAttribute(
    'data-tracking',
    'face',
    TRACKING,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/p\/harbour$/);

  // The frame stays in the try-on session for this tab.
  await page.goto('/try-on');
  await expect(page.getByRole('radio', { name: 'Harbour' })).toBeVisible();
});

test('Frame Finder measures face shape from the camera', async ({ page }) => {
  const uploads = watchUploads(page);
  await page.goto('/frame-finder');
  await page.getByRole('button', { name: 'Detect from camera' }).click();
  await page.getByRole('button', { name: 'Start camera' }).click();
  const result = page.getByRole('heading', { name: /^Your face looks \w+/ });
  await expect(result).toBeVisible(TRACKING);
  await expect(page.getByText(/^\d+% confident$/)).toBeVisible();
  await expect(page.getByText(/^Length \d\.\d\d × width/)).toBeVisible();
  await expectNoAxeViolations(page, 'face shape result');
  await page.getByRole('button', { name: /^Use \w+$/ }).click();
  await expect(page).toHaveURL(/face=\w+.*step=2/);
  await expect(page.getByRole('heading', { name: 'What’s your style?' })).toBeVisible();
  expect(uploads).toEqual([]);
});

test('the PD helper measures from a card or the eyes and fills the PD field', async ({ page }) => {
  const uploads = watchUploads(page);
  await page.goto('/p/harbour');
  await page.getByRole('button', { name: 'Choose lenses' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue' }).click();

  await dialog.getByRole('button', { name: 'Measure my PD with the camera' }).click();
  await dialog.getByRole('button', { name: 'Start camera' }).click();
  await dialog.getByRole('button', { name: 'No card? Estimate from eye size' }).click(TRACKING);
  const result = dialog.getByRole('heading', { name: /^Your PD is about \d+(\.5)? mm$/ });
  await expect(result).toBeVisible(TRACKING);
  const pd = /(\d+(?:\.5)?) mm$/.exec(await result.innerText())?.[1];
  await dialog.getByRole('button', { name: `Use ${pd} mm` }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'PD' })).toHaveValue(`${pd} mm`);

  // The card method: mark the card's edges on a still.
  await dialog.getByRole('button', { name: 'Measure my PD with the camera' }).click();
  await dialog.getByRole('button', { name: 'Start camera' }).click();
  await dialog.getByRole('button', { name: 'Take the measurement' }).click(TRACKING);
  const left = dialog.getByRole('slider', { name: 'Card left edge' });
  await expect(left).toBeVisible();
  await expect(dialog.getByRole('slider', { name: 'Card right edge' })).toBeVisible();
  await expectNoAxeViolations(page, 'PD card markers');
  await dialog.getByRole('button', { name: 'Use these edges' }).click();
  await expect(dialog.getByRole('heading', { name: /^Your PD is about/ })).toBeVisible();
  expect(uploads).toEqual([]);
});
