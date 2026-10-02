import { expect, test } from '@playwright/test';
import { isMobile } from './helpers';

test('search tolerates typos and leads to results', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  if (isMobile(testInfo)) {
    await page
      .getByRole('navigation', { name: 'Quick navigation' })
      .getByRole('button', { name: 'Search' })
      .click();
  } else {
    await page.locator('body').press('/');
  }
  const dialog = page.getByRole('dialog', { name: 'Search the store' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox').fill('titanum');
  await expect(dialog.getByRole('option', { name: /Zephyr/ })).toBeVisible();
  await expect(dialog.getByText(/\d+ frames? found/)).toBeAttached();

  await dialog.getByRole('option', { name: 'Search for “titanum”' }).click();
  await expect(page).toHaveURL(/\/search\?q=titanum/);
  await expect(page.getByText(/^Showing \d+ of \d+ frames?$/).first()).toBeVisible();
});
