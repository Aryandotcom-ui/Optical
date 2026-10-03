import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Screens are covered end to end (Playwright); the logic modules below are
      // unit-tested and must stay so.
      thresholds: {
        'src/lib/{api,cn,finder-params,listing-params,safe-next,seo,structured-data}.ts': {
          lines: 85,
          branches: 75,
          functions: 80,
          statements: 85,
        },
        'src/{app/status/derive-status,components/checkout/checkout-draft,components/configurator/lens-draft,components/configurator/rx-stepper}.{ts,tsx}':
          { lines: 80, branches: 65, functions: 70, statements: 80 },
      },
    },
  },
});
