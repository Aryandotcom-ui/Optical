import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

export const isMobile = (testInfo: TestInfo) => testInfo.project.name === 'mobile';

/** WCAG 2.2 AA rules, as the accessibility budget requires. */
export async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

/**
 * The filter controls: the sidebar on wide screens, the bottom sheet on
 * phones (opened here). Returns the region to look for filter chips in.
 */
export async function openFilters(page: Page, testInfo: TestInfo) {
  if (!isMobile(testInfo)) return page.locator('aside');
  await page.getByRole('button', { name: /^Filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  return sheet;
}
