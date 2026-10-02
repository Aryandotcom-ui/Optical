import { expect, test, type Page } from '@playwright/test';

/**
 * Interaction to Next Paint, measured: each interaction's Event Timing
 * duration (input delay + processing + presentation) on a CPU slowed down
 * four times, as Lighthouse's mobile profile does. Budget: 200 ms.
 */
const INP_BUDGET_MS = 200;

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'CPU throttling needs the Chrome DevTools Protocol',
);

async function slowDown(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function observeInteractions(page: Page) {
  await page.evaluate(() => {
    const target = window as unknown as { __durations: number[] };
    target.__durations = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEventTiming & {
        interactionId?: number;
      })[]) {
        if (entry.interactionId) target.__durations.push(entry.duration);
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  });
}

async function worstInteraction(page: Page): Promise<number> {
  await page.waitForTimeout(500);
  return page.evaluate(() =>
    Math.max(0, ...(window as unknown as { __durations: number[] }).__durations),
  );
}

test('filtering, choosing a colour and saving respond within budget', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one profile is enough for timing');

  await page.goto('/shop');
  await page.waitForLoadState('networkidle');
  await slowDown(page);
  await observeInteractions(page);
  await page
    .locator('aside')
    .getByRole('button', { name: /^Round, \d+ frames$/ })
    .click();
  await page
    .locator('article')
    .first()
    .getByRole('button', { name: /to your wishlist$/ })
    .click();
  expect(await worstInteraction(page), 'slowest listing interaction (ms)').toBeLessThan(
    INP_BUDGET_MS,
  );

  await page.goto('/p/harbour');
  await page.waitForLoadState('networkidle');
  await slowDown(page);
  await observeInteractions(page);
  await page
    .getByRole('group', { name: /^Colour:/ })
    .getByRole('button')
    .nth(2)
    .click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  expect(await worstInteraction(page), 'slowest product-page interaction (ms)').toBeLessThan(
    INP_BUDGET_MS,
  );
});
