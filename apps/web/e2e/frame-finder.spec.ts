import { expect, test, type Page } from '@playwright/test';

async function answerAll(page: Page) {
  await page.goto('/frame-finder');
  await expect(page.getByText('Step 1 of 5')).toBeVisible();
  await page.getByText('Heart', { exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Step 2 of 5')).toBeVisible();
  await page.getByText('Retro', { exact: true }).click();
  await page.getByText('Classic', { exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Step 3 of 5')).toBeVisible();
  await page.getByText('Screens and work').click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  // Every question can be skipped.
  await expect(page.getByText('Step 4 of 5')).toBeVisible();
  await page.getByRole('link', { name: 'Skip this question' }).click();

  await expect(page.getByText('Step 5 of 5')).toBeVisible();
  await page.getByText('Acetate', { exact: true }).click();
  await page.getByRole('button', { name: 'Show my frames' }).click();
}

test.describe('Frame Finder', () => {
  test('five steps lead to ranked frames with reasons, editable in place', async ({ page }) => {
    await answerAll(page);
    await expect(page).toHaveURL(
      /face=heart.*vibe=classic%2Cretro.*use=screens.*view=results.*material=acetate/,
    );
    await expect(page.getByRole('heading', { name: 'Your frames' })).toBeVisible();
    const results = page.getByRole('region', { name: 'Your frames' }).getByRole('listitem');
    await expect(results.first()).toContainText(/\d+% match/);
    await expect(results.first()).toContainText('Why it matches:');
    await expect(page.getByText(/suits heart faces/).first()).toBeVisible();

    const tryAll = page.getByRole('link', { name: 'Try these on' });
    await expect(tryAll).toHaveAttribute('href', /^\/try-on\?frames=[a-z-]+(,[a-z-]+)*&frame=/);

    // Remove one answer inline; the back button brings it back.
    await page.getByRole('link', { name: 'Remove Retro' }).click();
    await expect(page).toHaveURL(/vibe=classic&/);
    await expect(page.getByRole('link', { name: 'Remove Retro' })).toBeHidden();
    await page.goBack();
    await expect(page.getByRole('link', { name: 'Remove Retro' })).toBeVisible();

    // Every option is a link that switches it.
    await page.getByText('Change answers').click();
    await page.getByRole('link', { name: 'Oval', exact: true }).click();
    await expect(page).toHaveURL(/face=oval/);
    await expect(page.getByText(/suits oval faces/).first()).toBeVisible();
  });

  test('back keeps earlier answers, and a shared link restores them', async ({ page }) => {
    await page.goto('/frame-finder?face=round&use=active&step=3');
    await expect(page.getByRole('radio', { name: 'Active and on the go' })).toBeChecked();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByText('Step 2 of 5')).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('radio', { name: /^Round/ })).toBeChecked();
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the questions are plain forms and still reach the results', async ({ page }) => {
      await answerAll(page);
      await expect(page.getByRole('heading', { name: 'Your frames' })).toBeVisible();
      await expect(page.getByText(/\d+% match/).first()).toBeVisible();
    });
  });
});

test('the home try-on demo never asks for the camera', async ({ page }) => {
  await page.addInitScript(() => {
    const calls = { count: 0 };
    Object.defineProperty(window, '__cameraCalls', { value: calls });
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (constraints) => {
      calls.count += 1;
      return original(constraints);
    };
  });
  await page.goto('/');
  const demo = page.getByRole('region', { name: 'See it on you' });
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.getByRole('img', { name: /^Illustration: a face trying on/ })).toBeVisible();
  await expect(demo.getByRole('link', { name: 'Try frames on' })).toHaveAttribute(
    'href',
    '/try-on',
  );
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () => (window as unknown as { __cameraCalls: { count: number } }).__cameraCalls.count,
    ),
  ).toBe(0);
});
