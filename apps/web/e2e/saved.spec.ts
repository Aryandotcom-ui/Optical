import { expect, test } from '@playwright/test';

test.describe('wishlist and compare', () => {
  test('saving a frame from a card shows it on the wishlist', async ({ page }) => {
    await page.goto('/shop');
    const card = page.locator('article').first();
    const name = (await card.getByRole('heading', { level: 3 }).textContent())?.trim() ?? '';
    await card.getByRole('button', { name: `Save ${name} to your wishlist` }).click();
    await expect(
      card.getByRole('button', { name: `Save ${name} to your wishlist` }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(`${name} saved to your wishlist`)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /^Wishlist, 1 frame saved$/ }).first(),
    ).toBeVisible();

    await page.goto('/wishlist');
    await expect(page.getByText('1 saved frame')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();

    await page.getByRole('button', { name: `Save ${name} to your wishlist` }).click();
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible();
  });

  test('compare shows two frames side by side and marks differences', async ({ page }) => {
    for (const slug of ['harbour', 'zephyr']) {
      await page.goto(`/p/${slug}`);
      await page.getByRole('button', { name: 'Compare', exact: true }).click();
      await expect(page.getByRole('button', { name: 'In compare' })).toBeVisible();
    }
    await page.goto('/compare');
    const table = page.getByRole('table', { name: 'Frame comparison' });
    await expect(table.getByRole('columnheader', { name: /Harbour/ })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: /Zephyr/ })).toBeVisible();
    await expect(table.getByRole('rowheader', { name: /Lens width.*differs/ })).toBeVisible();

    await page.getByLabel('Show only differences').check();
    await expect(table.getByRole('rowheader', { name: /^Rim/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove Zephyr from compare' }).click();
    await expect(table.getByRole('columnheader', { name: /Zephyr/ })).toHaveCount(0);
  });
});
