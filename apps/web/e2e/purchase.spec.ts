import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './helpers';
import {
  addFrameOnly,
  addFrameWithLenses,
  emailsTo,
  openInStock,
  fillCheckout,
  placeOrder,
  uniqueEmail,
} from './purchase-helpers';

test.describe('buying glasses', () => {
  test('lenses, bag, checkout, test payment, confirmation, email and tracking', async ({
    page,
  }) => {
    const email = uniqueEmail('happy');
    await addFrameWithLenses(page);
    await expect(page.getByRole('link', { name: 'Bag, 1 item' })).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByText('Single vision · Mid-index 1.56 · Complete')).toBeVisible();
    await expect(page.getByText('Prescription typed in')).toBeVisible();
    await fillCheckout(page, email);
    const number = await placeOrder(page);

    await expect(page.getByRole('heading', { name: 'Almost there' })).toBeVisible();
    await page.getByRole('button', { name: 'Pay successfully' }).click();
    await expect(
      page.getByRole('heading', { name: 'Thank you. Your order is confirmed.' }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(`We've sent a confirmation to ${email}`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bag', exact: true })).toBeVisible();

    await expect
      .poll(async () => (await emailsTo(email)).map((message) => message.Subject), {
        timeout: 30_000,
      })
      .toContain(`Order ${number} confirmed`);

    await page.goto('/track');
    await page.getByLabel('Order number').fill(number.toLowerCase());
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Find my order' }).click();
    await expect(
      page.getByRole('heading', { name: 'Thank you. Your order is confirmed.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: `Order ${number}` })).toBeVisible();
  });

  test('a declined payment can be retried', async ({ page }) => {
    const email = uniqueEmail('declined');
    await addFrameOnly(page, 'wilder');
    await fillCheckout(page, email);
    await placeOrder(page);
    await page.getByRole('button', { name: 'Decline the payment' }).click();
    await expect(page.getByRole('heading', { name: "Your payment didn't go through" })).toBeVisible(
      {
        timeout: 20_000,
      },
    );
    await expect(page.getByText('The bank declined the payment (simulated).')).toBeVisible();
    // The bag is kept until a payment succeeds.
    await expect(page.getByRole('link', { name: 'Bag, 1 item' })).toBeVisible();

    await page.getByRole('button', { name: 'Try paying again' }).click();
    await page.getByRole('button', { name: 'Pay successfully' }).click();
    await expect(
      page.getByRole('heading', { name: 'Thank you. Your order is confirmed.' }),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test('a pending payment shows as processing until the bank confirms', async ({ page }) => {
    test.setTimeout(90_000);
    await addFrameOnly(page, 'juniper');
    await fillCheckout(page, uniqueEmail('pending'));
    await placeOrder(page);
    await page.getByRole('button', { name: 'Leave it pending' }).click();
    await expect(page.getByRole('heading', { name: 'Your payment is processing' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Thank you. Your order is confirmed.' }),
    ).toBeVisible({
      timeout: 60_000,
    });
  });

  test('cash on delivery, with the prescription sent after ordering', async ({ page }) => {
    await openInStock(page, 'tove');
    await page.getByRole('button', { name: 'Choose lenses' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('radio', { name: /^Send it later/ }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    for (let step = 0; step < 3; step += 1)
      await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog.getByText(/Add your prescription after ordering/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Add to bag' }).click();
    await expect(page.getByText(/with your lenses is in your bag/)).toBeVisible();

    await fillCheckout(page, uniqueEmail('cod'));
    await placeOrder(page, /^Cash on delivery/);
    await expect(
      page.getByRole('heading', { name: 'Thank you. Your order is confirmed.' }),
    ).toBeVisible();
    await expect(page.getByText('Cash on delivery fee')).toBeVisible();

    const prescription = page.getByRole('region', { name: 'We still need your prescription' });
    await expect(prescription).toBeVisible();
    await prescription.getByText('Type it in').click();
    const sph = prescription.getByRole('spinbutton', { name: 'SPH' });
    await sph.first().fill('-1.5');
    await sph.nth(1).fill('-1.25');
    await prescription.getByRole('spinbutton', { name: 'PD' }).fill('62');
    await prescription.getByRole('spinbutton', { name: 'PD' }).blur();
    await prescription.getByRole('button', { name: 'Save prescription' }).click();
    await expect(page.getByText('Prescription received: an optician will check it.')).toBeVisible();
    await expect(prescription).toBeHidden();
  });

  test('the configurator explains prescription mistakes and keeps the price live', async ({
    page,
  }) => {
    await openInStock(page, 'orla');
    await page.getByRole('button', { name: 'Choose lenses' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('spinbutton', { name: 'CYL' }).first().fill('-0.75');
    await dialog.getByRole('spinbutton', { name: 'PD' }).fill('63');
    await dialog.getByRole('spinbutton', { name: 'PD' }).blur();
    await expect(dialog.getByText(/has a cylinder value, so it needs an axis too/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(
      dialog.getByText('Finish your prescription, upload it, or choose to send it later.'),
    ).toBeVisible();
    await dialog.getByRole('spinbutton', { name: 'AXIS' }).first().fill('90');
    await dialog.getByRole('spinbutton', { name: 'AXIS' }).first().blur();
    await expect(dialog.getByText(/needs an axis too/)).toBeHidden();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(
      dialog.getByRole('heading', { name: 'How thin should the lenses be?' }),
    ).toBeVisible();
    await expectNoAxeViolations(page, 'lens configurator');
  });

  test('checkout validates as you go and coupons explain themselves', async ({ page }) => {
    await addFrameOnly(page, 'yara');
    await page.goto('/cart');
    await page.getByLabel('Coupon code').fill('NOPE10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(
      page.getByText("We don't recognise the code NOPE10. Check the spelling."),
    ).toBeVisible();
    await page.getByLabel('Coupon code').fill('FREESHIP');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('FREESHIP applied')).toBeVisible();

    await page.getByRole('link', { name: 'Check out' }).click();
    await page.getByLabel('Email', { exact: true }).fill('not-an-email');
    await page.getByLabel('Mobile number').fill('12345');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Enter an email address like name@example.com.')).toBeVisible();
    await expect(page.getByText('Enter a 10-digit mobile number, like 98765 43210.')).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();

    // What was typed survives a reload.
    await page.reload();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('not-an-email');
    await expectNoAxeViolations(page, '/checkout');
  });

  test('the bag and order pages are accessible', async ({ page }) => {
    await addFrameOnly(page, 'gale');
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Your bag', exact: true })).toBeVisible();
    await expectNoAxeViolations(page, '/cart');
    await fillCheckout(page, uniqueEmail('a11y'));
    await placeOrder(page);
    await expect(page.getByRole('button', { name: 'Pay successfully' })).toBeVisible();
    await expectNoAxeViolations(page, '/order');
    await page.goto('/track');
    await expectNoAxeViolations(page, '/track');
  });
});
