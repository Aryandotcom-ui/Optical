import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against production builds of the web app and API with
 * the seeded demo data. Locally: `pnpm build`, then `pnpm test:e2e` (it
 * starts both apps, or reuses ones already running). CI starts the apps
 * itself and sets E2E_BASE_URL.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const executablePath = process.env.CHROMIUM_PATH ?? undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A flaky test is a bug to fix, not to retry past.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /responsiveness/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', testIgnore: /responsiveness/, use: { ...devices['Pixel 7'] } },
    // Timing runs last and alone, so other test browsers don't compete for the CPU.
    {
      name: 'responsiveness',
      testMatch: /responsiveness/,
      dependencies: ['desktop', 'mobile'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @optical/api start',
          url: 'http://localhost:4000/readyz',
          reuseExistingServer: true,
          cwd: '../..',
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter @optical/web start',
          url: `${baseURL}/healthz`,
          reuseExistingServer: true,
          cwd: '../..',
          timeout: 120_000,
        },
      ],
});
