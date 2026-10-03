import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './helpers';
import { emailsTo, fillCheckout, openInStock, placeOrder, uniqueEmail } from './purchase-helpers';

const TEAM = {
  admin: { email: 'admin@example.com', password: 'Admin#Lumen2026' },
  staff: { email: 'staff@example.com', password: 'Staff#Lumen2026' },
};

async function signInToAdmin(page: Page, who: keyof typeof TEAM, path = '/admin') {
  await page.goto(path);
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email', { exact: true }).fill(TEAM[who].email);
  await page.getByLabel('Password', { exact: true }).fill(TEAM[who].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

/** A guest order whose prescription was typed in after ordering: it waits for review. */
async function orderWithPrescriptionToCheck(page: Page) {
  await openInStock(page, 'tove');
  await page.getByRole('button', { name: 'Choose lenses' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('radio', { name: /^Send it later/ }).check();
  for (let step = 0; step < 4; step += 1)
    await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: 'Add to bag' }).click();
  await expect(page.getByText(/with your lenses is in your bag/)).toBeVisible();
  const email = uniqueEmail('admin-rx');
  await fillCheckout(page, email);
  const number = await placeOrder(page);
  // Paid (the mock provider's webhook arrives through the worker) before review.
  await page.getByRole('button', { name: 'Pay successfully' }).click();
  await expect(
    page.getByRole('heading', { name: 'Thank you. Your order is confirmed.' }),
  ).toBeVisible();
  const prescription = page.getByRole('region', { name: 'We still need your prescription' });
  await prescription.getByText('Type it in').click();
  const sph = prescription.getByRole('spinbutton', { name: 'SPH' });
  await sph.first().fill('-1.5');
  await sph.nth(1).fill('-1.25');
  await prescription.getByRole('spinbutton', { name: 'PD' }).fill('62');
  await prescription.getByRole('spinbutton', { name: 'PD' }).blur();
  await prescription.getByRole('button', { name: 'Save prescription' }).click();
  await expect(page.getByText('Prescription received: an optician will check it.')).toBeVisible();
  return { email, number };
}

test.describe('admin', () => {
  test('staff approve a prescription and the order moves into production', async ({
    page,
    browser,
  }) => {
    test.slow();
    const { email, number } = await orderWithPrescriptionToCheck(page);

    const teamContext = await browser.newContext();
    const team = await teamContext.newPage();
    await signInToAdmin(team, 'staff');
    await expect(team.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expectNoAxeViolations(team, '/admin');
    // Staff don't see admin-only areas, and can't open them by URL.
    const nav = team.getByRole('navigation', { name: 'Admin' });
    await expect(nav.getByRole('link', { name: 'Prescriptions' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await team.goto('/admin/settings');
    await expect(
      team.getByRole('heading', { name: 'Your role can’t open this page' }),
    ).toBeVisible();

    await team.goto('/admin/prescriptions?status=PENDING_REVIEW');
    await team.getByRole('row').filter({ hasText: number }).click();
    await expect(team.getByRole('heading', { name: /^Prescription for/ })).toBeVisible();
    await expect(team.getByRole('cell', { name: '−1.50' })).toBeVisible();
    await expectNoAxeViolations(team, '/admin/prescriptions/[id]');
    await team.getByRole('button', { name: 'Approve prescription' }).click();
    await expect(team.getByText('Approved. The customer has been emailed.')).toBeVisible();

    await team.getByRole('link', { name: number }).click();
    await expect(team.getByRole('heading', { name: number })).toBeVisible();
    await expect(team.getByText('In production').first()).toBeVisible();
    await expect
      .poll(async () => (await emailsTo(email)).map((message) => message.Subject))
      .toContain(`Prescription checked for order ${number}`);
    await teamContext.close();
  });

  test('admins adjust stock, change settings, and every change is in the audit log', async ({
    page,
  }) => {
    await signInToAdmin(page, 'admin', '/admin/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await expectNoAxeViolations(page, '/admin/inventory');
    await page.getByRole('row').nth(1).getByRole('button', { name: 'Adjust' }).click();
    await page.getByLabel('Change (+/−)').fill('3');
    await page.getByLabel('Reason').fill('Cycle count');
    await page.getByRole('button', { name: 'Adjust stock' }).click();
    await expect(page.getByLabel('Change (+/−)')).toBeHidden();

    await page
      .getByRole('navigation', { name: 'Admin' })
      .getByRole('link', { name: 'Settings' })
      .click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expectNoAxeViolations(page, '/admin/settings');

    await page
      .getByRole('navigation', { name: 'Admin' })
      .getByRole('link', { name: 'Audit log' })
      .click();
    await expect(page.getByRole('cell', { name: 'stock.adjust' }).first()).toBeVisible();
    await expectNoAxeViolations(page, '/admin/audit');
  });

  test('shoppers are kept out of the admin', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page.getByRole('heading', { name: 'Sign in to the admin' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
