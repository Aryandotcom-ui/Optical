import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './helpers';
import { addFrameOnly, emailsTo, openInStock, placeOrder, uniqueEmail } from './purchase-helpers';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const PASSWORD = 'Harbour-Lights-2026';

async function register(page: Page, email: string, name = 'Meera Iyer') {
  await page.goto('/register');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: `Hello, ${name.split(' ')[0]}` })).toBeVisible();
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** The newest email to an address, as plain text. */
async function latestEmailText(address: string, subject: RegExp): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(async () => {
      const messages = (await emailsTo(address)) as { Subject: string; ID?: string }[];
      id = messages.find((message) => subject.test(message.Subject))?.ID;
      return id;
    })
    .toBeTruthy();
  const response = await fetch(`${MAILPIT}/api/v1/message/${id ?? ''}`);
  return ((await response.json()) as { Text: string }).Text;
}

test.describe('accounts', () => {
  test('signing up keeps the guest bag and wishlist, and the account survives signing out', async ({
    page,
  }) => {
    await addFrameOnly(page, 'linden');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const email = uniqueEmail('signup');
    await register(page, email);
    await expect(page.getByRole('link', { name: /^Bag, 1 item/ })).toBeVisible();
    await page.goto('/wishlist');
    await expect(page.getByText('1 saved frame')).toBeVisible();
    await expect(page.getByText(/saved to your account/)).toBeVisible();

    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
    await signIn(page, email, 'not-my-password');
    await expect(page.getByText(/do not match/)).toBeVisible();
    await signIn(page, email);
    await expect(page).toHaveURL(/\/account$/);
    // The bag and wishlist came back with the account.
    await expect(page.getByRole('link', { name: /^Bag, 1 item/ })).toBeVisible();
  });

  test('a saved prescription and address carry into lenses and checkout', async ({ page }) => {
    const email = uniqueEmail('saved');
    await register(page, email);

    await page.goto('/account/prescriptions');
    await page.getByRole('button', { name: 'Add a prescription' }).click();
    await page.getByLabel('Name').fill('Everyday');
    const sph = page.getByRole('spinbutton', { name: 'SPH' });
    await sph.first().fill('-1.5');
    await sph.nth(1).fill('-1.25');
    await page.getByRole('spinbutton', { name: 'PD' }).fill('62');
    await page.getByRole('button', { name: 'Save prescription' }).click();
    await expect(page.getByRole('heading', { name: 'Everyday' })).toBeVisible();

    await openInStock(page, 'harbour');
    await page.getByRole('button', { name: 'Choose lenses' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    const saved = dialog.getByRole('radio', { name: /^Use a saved prescription/ });
    await saved.click();
    await expect(saved).toBeChecked();
    await dialog.getByRole('radio', { name: /^Everyday/ }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog.getByRole('radio', { name: /Recommended/ })).toBeChecked();
    for (let step = 0; step < 3; step += 1)
      await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog.getByText(/saved prescription “Everyday”/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Add to bag' }).click();
    await expect(page.getByText(/with your lenses is in your bag/)).toBeVisible();

    await page.goto('/checkout');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
    await page.getByLabel('Mobile number').fill('98765 43210');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Full name').fill('Meera Iyer');
    await page.getByLabel('PIN code', { exact: true }).fill('560038');
    await page.getByLabel('House, building and street').fill('7, 1st Main, Jayanagar');
    await expect(page.getByLabel('Save this address to my account')).toBeChecked();
    await page.getByRole('button', { name: 'Continue' }).click();
    const number = await placeOrder(page, /^Cash on delivery/);

    await page.goto('/account/orders');
    await expect(page.getByRole('link', { name: `View order ${number}` })).toBeVisible();
    await page.goto('/account/addresses');
    await expect(page.getByText('7, 1st Main, Jayanagar')).toBeVisible();
    await expect(page.getByText('Default', { exact: true })).toBeVisible();
  });

  test('an order can be paid, invoiced and cancelled from the account', async ({ page }) => {
    const email = uniqueEmail('actions');
    await register(page, email);
    await addFrameOnly(page, 'marlow');
    await page.goto('/checkout');
    await page.getByLabel('Mobile number').fill('98765 43210');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Full name').fill('Meera Iyer');
    await page.getByLabel('PIN code', { exact: true }).fill('560038');
    await page.getByLabel('House, building and street').fill('7, 1st Main, Jayanagar');
    await page.getByRole('button', { name: 'Continue' }).click();
    const number = await placeOrder(page);
    await page.getByRole('button', { name: 'Pay successfully' }).click();
    await expect(page.getByRole('heading', { name: /order is confirmed/ })).toBeVisible();

    // Opened from the account, without the link's token.
    await page.goto(`/order/${number}`);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download invoice (PDF)' }).click();
    expect((await download).suggestedFilename()).toBe(`invoice-${number}.pdf`);

    await page.getByRole('button', { name: 'Cancel order' }).click();
    await page.getByRole('button', { name: 'Yes, cancel the order' }).click();
    await expect(page.getByRole('heading', { name: 'This order was cancelled' })).toBeVisible();
    await expect
      .poll(async () => (await emailsTo(email)).map((m) => m.Subject))
      .toContain(`Order ${number} is cancelled`);
  });

  test('a forgotten password is reset from the emailed link', async ({ page }) => {
    const email = uniqueEmail('reset');
    await register(page, email);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    const text = await latestEmailText(email, /Reset your password/);
    const link = /https?:\/\/\S+\/reset-password#token=[A-Za-z0-9_-]{43}/.exec(text)?.[0];
    expect(link).toBeTruthy();
    await page.goto(new URL(link ?? '').pathname + new URL(link ?? '').hash);
    // The token leaves the address bar as soon as it is read.
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel('New password').fill('Quiet-Lagoon-4417');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText(/password is changed/)).toBeVisible();

    await page.goto('/sign-in');
    await signIn(page, email, 'Quiet-Lagoon-4417');
    await expect(page).toHaveURL(/\/account$/);
  });

  test('a guest can create an account after ordering', async ({ page }) => {
    const email = uniqueEmail('after');
    await addFrameOnly(page, 'linden');
    await page.goto('/checkout');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Mobile number').fill('98765 43210');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Full name').fill('Arjun Rao');
    await page.getByLabel('PIN code', { exact: true }).fill('560038');
    await page.getByLabel('House, building and street').fill('3, Lake View Road');
    await page.getByRole('button', { name: 'Continue' }).click();
    const number = await placeOrder(page, /^Cash on delivery/);

    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page.getByText(/This order is now in it/)).toBeVisible();
    await page.goto('/account/orders');
    await expect(page.getByRole('link', { name: `View order ${number}` })).toBeVisible();
  });

  test('sign-in and account pages meet WCAG 2.2 AA', async ({ page }) => {
    await page.goto('/sign-in');
    await expectNoAxeViolations(page, 'sign in');
    await page.goto('/forgot-password');
    await expectNoAxeViolations(page, 'forgot password');
    await register(page, uniqueEmail('a11y'));
    await expectNoAxeViolations(page, 'account overview');
    await page.goto('/account/prescriptions');
    await page.getByRole('button', { name: 'Add a prescription' }).click();
    await expectNoAxeViolations(page, 'prescription form');
    await page.goto('/account/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expectNoAxeViolations(page, 'settings');
  });
});
