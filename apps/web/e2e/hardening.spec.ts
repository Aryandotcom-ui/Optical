import { expect, test } from '@playwright/test';

/** Pages that between them use every client feature: 3D, dialogs, forms, the camera tools. */
const pages = [
  '/',
  '/shop',
  '/p/harbour',
  '/cart',
  '/try-on',
  '/frame-finder',
  '/sign-in',
  '/admin',
];

test.describe('hardening', () => {
  test('every page sends a Content-Security-Policy and breaks none of it', async ({ page }) => {
    const violations: string[] = [];
    await page.exposeFunction('reportCspViolation', (text: string) => violations.push(text));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { reportCspViolation: (text: string) => void }).reportCspViolation(
          `${event.violatedDirective} ${event.blockedURI}`,
        );
      });
    });
    for (const path of pages) {
      const response = await page.goto(path);
      const policy = response?.headers()['content-security-policy'] ?? '';
      expect(policy, path).toContain("frame-ancestors 'none'");
      expect(policy, path).toContain("object-src 'none'");
      await page.waitForLoadState('networkidle');
    }
    expect(violations).toEqual([]);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    for (const path of ['/', '/p/harbour', '/shop']) {
      test(`nothing moves on its own on ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.mouse.wheel(0, 1500);
        // Short fades are fine; nothing may loop or run for longer than a moment.
        const moving = await page.evaluate(() =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === 'running')
            .map((animation) => {
              const timing = animation.effect?.getComputedTiming();
              return {
                name: animation instanceof CSSAnimation ? animation.animationName : 'transition',
                iterations: timing?.iterations ?? 1,
                duration: Number(timing?.duration ?? 0),
              };
            })
            .filter((item) => item.iterations === Infinity || item.duration > 300),
        );
        expect(moving).toEqual([]);
      });
    }
  });

  test('the home page and product pages carry structured data', async ({ page }) => {
    await page.goto('/');
    const site = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}',
    ) as { '@graph': { '@type': string }[] };
    expect(site['@graph'].map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);

    await page.goto('/p/harbour');
    const product = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}',
    ) as { '@type': string; offers: unknown[] };
    expect(product['@type']).toBe('Product');
    expect(product.offers.length).toBeGreaterThan(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/p\/harbour$/);
  });
});
