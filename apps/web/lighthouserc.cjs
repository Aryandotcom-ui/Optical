/**
 * Lighthouse CI: performance and quality budgets for the main storefront
 * routes (docs/TESTING.md), on Lighthouse's mobile profile: a Moto G Power
 * screen, 150 ms RTT, 1.6 Mbps down and 4x CPU slowdown.
 *
 * Throttling is applied in the browser ("devtools") rather than simulated.
 * Simulation replays an unthrottled trace, and against a local HTTP/1.1
 * server that trace runs hydration before the hero image paints, so it
 * reports an LCP no real phone would see. Applied throttling loads the page
 * as a slow phone would, and three runs are taken to smooth out noise.
 *
 * INP needs real interactions, so it is measured in the Playwright suite
 * (e2e/responsiveness.spec.ts); Total Blocking Time is tracked here as an
 * early warning. The initial-JavaScript budget is checked separately by
 * scripts/check-js-budget.mjs, because Lighthouse's script total also counts
 * prefetches for linked pages.
 */
const base = (process.env.LHCI_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const median = { aggregationMethod: 'median-run' };

module.exports = {
  ci: {
    collect: {
      url: [`${base}/`, `${base}/shop`, `${base}/p/harbour`, `${base}/frame-finder`],
      numberOfRuns: Number(process.env.LHCI_RUNS ?? 3),
      settings: {
        throttlingMethod: 'devtools',
        chromeFlags: '--headless=new --no-sandbox',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9, ...median }],
        'categories:accessibility': ['error', { minScore: 0.95, ...median }],
        'categories:best-practices': ['error', { minScore: 0.95, ...median }],
        'categories:seo': ['error', { minScore: 0.95, ...median }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000, ...median }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05, ...median }],
        'total-blocking-time': ['warn', { maxNumericValue: 200, ...median }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
