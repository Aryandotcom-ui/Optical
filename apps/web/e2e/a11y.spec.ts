import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, isMobile, openFilters } from './helpers';

const pages = [
  '/',
  '/shop',
  '/shop/sunglasses?shape=aviator',
  '/shop?shape=round&category=kids&material=titanium',
  '/collections/featherweight',
  '/search?q=round',
  '/p/harbour',
  '/p/zephyr?reviews=helpful',
  '/wishlist',
  '/compare',
  '/help',
  '/help/size-guide',
  '/help/prescription',
  '/help/returns',
  '/legal/privacy',
  '/not-a-page',
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme });

    for (const path of pages) {
      test(`axe finds no WCAG 2.2 AA issues on ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectNoAxeViolations(page, path);
      });
    }

    test('menus, sheets and the search palette are accessible when open', async ({
      page,
    }, testInfo) => {
      await page.goto('/shop');
      if (isMobile(testInfo)) {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
        await expectNoAxeViolations(page, 'mobile menu');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
      } else {
        await page.getByRole('button', { name: 'Shop' }).click();
        await expect(page.getByRole('link', { name: /^Sunglasses/ }).first()).toBeVisible();
        await expectNoAxeViolations(page, 'mega menu');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'Shop' })).toBeFocused();
      }
      await openFilters(page, testInfo);
      await expectNoAxeViolations(page, 'filters');
    });
  });
}
