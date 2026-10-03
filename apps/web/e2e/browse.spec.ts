import { expect, test } from '@playwright/test';
import { isMobile, openFilters } from './helpers';

test.describe('browsing', () => {
  test('home loads without popups and leads into the shop', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glasses, made clear.');
    // No interstitials, cookie walls or sign-up prompts on arrival.
    await page.waitForTimeout(1500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Shop eyeglasses' }).click();
    await expect(page).toHaveURL(/\/shop\/eyeglasses$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eyeglasses');
  });

  test('filters live in the URL and survive back and forward', async ({ page }, testInfo) => {
    await page.goto('/shop');
    const showing = page.getByText(/^Showing \d+ of \d+ frames$/).first();
    const before = await showing.textContent();

    const filters = await openFilters(page, testInfo);
    await filters.getByRole('button', { name: /^Round, \d+ frames$/ }).click();
    await expect(page).toHaveURL(/[?&]shape=round\b/);
    if (isMobile(testInfo)) await page.getByRole('button', { name: /^Show \d+ frames?$/ }).click();
    await expect(showing).not.toHaveText(before ?? '');
    await expect(page.getByRole('button', { name: 'Remove filter: Round' })).toBeVisible();

    // A shared link reproduces the same results.
    const filteredUrl = page.url();
    const filteredCount = await showing.textContent();
    await page.goto(filteredUrl);
    await expect(page.getByText(/^Showing \d+ of \d+ frames$/).first()).toHaveText(
      filteredCount ?? '',
    );

    await page.goBack();
    await expect(page).not.toHaveURL(/shape=/);
  });

  test('an empty result offers the filter that brings frames back', async ({ page }) => {
    await page.goto('/shop?shape=round&category=kids&material=titanium');
    await expect(
      page.getByRole('heading', { name: 'No frames match those filters' }),
    ).toBeVisible();
    const recover = page.getByRole('button', { name: /^Remove “.+” to see \d+ frames?$/ });
    await recover.click();
    await expect(page.getByText(/^Showing \d+ of \d+ frames?$/).first()).toBeVisible();
  });

  test('product page: colour, delivery estimate and measurements', async ({ page }) => {
    await page.goto('/shop/eyeglasses');
    // The card's title link stretches over the whole card.
    await page
      .locator('article')
      .first()
      .getByRole('heading', { level: 3 })
      .getByRole('link')
      .click();
    await expect(page).toHaveURL(/\/p\/[a-z0-9-]+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const colours = page.getByRole('group', { name: /^Colour:/ }).getByRole('button');
    await colours.nth(1).click();
    await expect(page).toHaveURL(/[?&]colour=/);
    await expect(colours.nth(1)).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('textbox', { name: /PIN code/ }).fill('560001');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('With prescription lenses')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Fit and measurements' })).toBeVisible();
    await expect(
      page.getByRole('img', { name: /drawn to scale beside a bank card/ }),
    ).toBeVisible();
  });

  test('product structured data describes the product and its offers', async ({ page }) => {
    await page.goto('/p/harbour');
    const json = await page.locator('script[type="application/ld+json"]').first().textContent();
    const data = JSON.parse(json ?? '{}') as {
      '@type': string;
      name: string;
      offers: { priceCurrency: string }[];
    };
    expect(data['@type']).toBe('Product');
    expect(data.name).toBe('Harbour');
    expect(data.offers.length).toBeGreaterThan(0);
    expect(data.offers[0]?.priceCurrency).toBe('INR');
  });

  test('unknown products get a helpful 404', async ({ page }) => {
    const response = await page.goto('/p/not-a-real-frame');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'Browse all frames' })).toBeVisible();
  });
});
