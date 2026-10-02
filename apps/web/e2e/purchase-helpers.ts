import { expect, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const API = process.env.E2E_API_URL ?? 'http://localhost:4000';

/**
 * Opens a product in its best-stocked colour. Unpaid test orders hold
 * stock for 15 minutes, so tests never rely on one colour staying available.
 */
export async function openInStock(page: Page, slug: string) {
  const response = await fetch(`${API}/v1/products/${slug}`);
  const product = (await response.json()) as { variants: { id: string; stockState: string }[] };
  const variant =
    product.variants.find((entry) => entry.stockState === 'in-stock') ?? product.variants[0];
  await page.goto(`/p/${slug}?colour=${variant?.id ?? ''}`);
}

/** A fresh address per test, so first-order coupons and email checks never collide. */
export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

/** Single-vision lenses with a typed prescription, recommended thickness and the Complete package. */
export async function addFrameWithLenses(page: Page, slug = 'harbour') {
  await openInStock(page, slug);
  await page.getByRole('button', { name: 'Choose lenses' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /^Single vision/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Continue' }).click();

  await expect(dialog.getByRole('heading', { name: 'Your prescription' })).toBeFocused();
  const sph = dialog.getByRole('spinbutton', { name: 'SPH' });
  await sph.first().fill('-2.25');
  await sph.nth(1).fill('-2');
  await dialog.getByRole('spinbutton', { name: 'PD' }).fill('63');
  await dialog.getByRole('spinbutton', { name: 'PD' }).blur();
  await dialog.getByRole('button', { name: 'Continue' }).click();

  await expect(dialog.getByRole('radio', { name: /Recommended/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('radio', { name: /^Complete/ }).check();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();

  await expect(dialog.getByRole('heading', { name: 'Review your lenses' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Add to bag' }).click();
  await expect(page.getByText(/with your lenses is in your bag/)).toBeVisible();
}

export async function addFrameOnly(page: Page, slug: string) {
  await openInStock(page, slug);
  await page.getByRole('button', { name: 'Frame only' }).click();
  await expect(page.getByText(/is in your bag/)).toBeVisible();
}

/** Contact and delivery, ready for the payment step. */
export async function fillCheckout(page: Page, email: string) {
  await page.goto('/cart');
  await page.getByRole('link', { name: 'Check out' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mobile number').fill('98765 43210');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Full name').fill('Test Customer');
  await page.getByLabel('PIN code', { exact: true }).fill('560038');
  // Filled in from the PIN code.
  await expect(page.getByLabel('City')).toHaveValue('Bengaluru');
  await expect(page.getByLabel('State')).toHaveValue('Karnataka');
  await page.getByLabel('House, building and street').fill('14, 2nd Cross, Indiranagar');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
}

export async function placeOrder(page: Page, method = /^Test payment/) {
  await page.getByRole('radio', { name: method }).check();
  await page.getByRole('button', { name: /^Place order/ }).click();
  await expect(page).toHaveURL(/\/order\/LO-\d{2}-\d{6}\?token=/);
  return /\/order\/(LO-\d{2}-\d{6})/.exec(page.url())?.[1] ?? '';
}

/** Emails Mailpit received for an address. */
export async function emailsTo(address: string): Promise<{ Subject: string }[]> {
  const response = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  );
  const body = (await response.json()) as { messages: { Subject: string }[] };
  return body.messages;
}
