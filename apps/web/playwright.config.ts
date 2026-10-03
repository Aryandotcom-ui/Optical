import { defineConfig, devices } from '@playwright/test';
import { FAKE_CAMERA_FILE } from './e2e/fake-camera';

/**
 * End-to-end tests against production builds of the web app, API and
 * worker with the seeded demo data, plus Mailpit for emails. Locally:
 * `pnpm build`, then `pnpm test:e2e` (it starts the apps, or reuses ones
 * already running). CI starts the apps itself and sets E2E_BASE_URL.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const executablePath = process.env.CHROMIUM_PATH ?? undefined;

export default defineConfig({
  testDir: './e2e',
  // Makes the fake camera video from the test face before any browser starts.
  globalSetup: './e2e/global-setup.ts',
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
      testIgnore: /responsiveness|camera\.spec/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', testIgnore: /responsiveness|camera\.spec/, use: { ...devices['Pixel 7'] } },
    // Try-on, face shape and PD with Chromium's fake camera playing the test face,
    // and software WebGL so three.js and MediaPipe run without a GPU.
    {
      name: 'camera',
      testMatch: /camera\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        permissions: ['camera'],
        // Full Chromium in its new headless mode, not the headless shell: WebGL 2 on
        // SwiftShader is what three.js and MediaPipe need, and the shell may lack it.
        ...(executablePath ? {} : { channel: 'chromium' }),
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${FAKE_CAMERA_FILE}`,
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
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
          // Delivers mock payment webhooks and sends emails; a running dev worker also works.
          command: 'pnpm --filter @optical/api start:worker',
          wait: { stdout: /Worker started/ },
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
