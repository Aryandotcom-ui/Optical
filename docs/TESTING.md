# Testing

## Commands

| Command                                | What it runs                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm test`                            | Every package's unit and integration tests (Vitest), in parallel through Turborepo. |
| `pnpm test:coverage`                   | The same, with V8 coverage. `packages/shared` and `apps/api` fail below 80%.        |
| `pnpm lint`                            | ESLint with type-aware rules, React, hooks, jsx-a11y and Next.js rules.             |
| `pnpm typecheck`                       | `tsc --noEmit` in every package.                                                    |
| `pnpm check`                           | lint, typecheck, test and build, in that order. Run it before pushing.              |
| `pnpm --filter @optical/web test:e2e`  | Playwright against production builds (see below).                                   |
| `pnpm --filter @optical/web budget:js` | Initial JavaScript per page, gzipped, against the 170 kB budget.                    |
| `pnpm --filter @optical/web lhci`      | Lighthouse CI budgets on Home, a listing and a product page.                        |

Run a single package with `pnpm --filter @optical/api test`, or watch mode with
`pnpm --filter @optical/shared exec vitest`.

## What is tested where

| Package           | Focus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Style                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `packages/config` | Env validation, feature-flag parsing, postal codes, PIN lookup and phone formats, design-token drift and WCAG contrast.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Unit                         |
| `packages/shared` | Money maths, pricing, lens rules, prescriptions, the order state machine and the checkout contracts; a guard that Zod stays out of browser entry points. Property-based tests (fast-check) for invariants such as "tax + net = gross".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Unit + property              |
| `apps/api`        | HTTP behaviour through `app.inject()` against the seeded test database: bag re-pricing and stock, CSRF, idempotent orders, stock holds and expiry, mock payments (success, failure, pending, duplicate and forged webhooks, retry, reconciliation), cash on delivery, tracking, uploads (magic bytes, EXIF stripping, size cap, signed links), rate limits, the email outbox. Accounts and security: Argon2id storage, hardened cookies, refresh rotation and reuse detection, forged and expired tokens, lockout backoff, login CSRF, enumeration-safe answers, single-use reset links, sign-out and password change revoking sessions, account isolation, guest-bag merge, saved prescriptions and addresses, cancel/return/reorder, PDF invoices, wishlist sharing, data export and deletion. Razorpay and Stripe against recorded request shapes and their signature schemes, no network. | Integration (in-process)     |
| `apps/web`        | Components (Testing Library + jsdom) including the prescription stepper, configurator and checkout logic, the server API client, status derivation, and copy rules (no exclamation marks, no hard-coded brand name).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Unit + component             |
| `apps/web/e2e`    | Journeys (browse, filter, product page, wishlist, compare, search, buying, accounts: sign-up with bag and wishlist merge, saved prescription and address through checkout, invoice and cancel, password reset by email, account after a guest order), axe on every page and on open menus in both themes, and measured INP.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Playwright, desktop + mobile |

## The test database

API tests need Postgres and Redis (`pnpm docker:up`). A Vitest global setup
(`apps/api/test/global-setup.ts`) migrates and seeds the separate `optical_test` database once per
run, so tests never touch development data and always see the same deterministic catalogue.

| Variable             | Default                                                    | Purpose                                                              |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `TEST_DATABASE_URL`  | `postgresql://optical:optical@localhost:5432/optical_test` | Database the API tests use.                                          |
| `TEST_REDIS_URL`     | `redis://localhost:6379`                                   | Redis for cache and probe tests.                                     |
| `TEST_SKIP_DB_SETUP` | unset                                                      | Set to `1` to reuse an already-seeded test database (faster reruns). |

## End-to-end tests

Playwright runs against production builds with the seeded catalogue, in a desktop (1440 px) and a
mobile (Pixel 7) project:

```bash
pnpm build
pnpm --filter @optical/web test:e2e   # starts the API, worker and web app, or reuses running ones
```

Purchase tests also need Mailpit (`pnpm docker:up`) and the worker, which delivers mock payment
webhooks and sends email. They place many orders from one machine, so set `RATE_LIMIT_SCALE=50` in
`.env` (CI does), and a short `MOCK_PENDING_SETTLE_SECONDS` (CI uses 5) to keep the pending-payment
test quick. Unpaid test orders hold stock for 15 minutes, so the specs pick each frame's
best-stocked colour through the API.

Set `E2E_BASE_URL` to test an already running storefront, and `CHROMIUM_PATH` to use an installed
Chromium instead of Playwright's (`pnpm --filter @optical/web exec playwright install chromium`).
Browser-side requests go to the API, whose CORS allows `http://localhost:3000`, so run the
storefront on that port.

| Spec                     | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browse.spec.ts`         | No popups on arrival; filters in the URL (shared links, back/forward); empty-state recovery; product colour, delivery estimate, JSON-LD; 404.                                                                                                                                                                                                                                                                                          |
| `saved.spec.ts`          | Wishlist from a card to the wishlist page; compare two frames with differences marked.                                                                                                                                                                                                                                                                                                                                                 |
| `search.spec.ts`         | The palette with a typo ("titanum") to results.                                                                                                                                                                                                                                                                                                                                                                                        |
| `a11y.spec.ts`           | axe (WCAG 2.2 AA) on 16 pages in light and dark, plus the open mega menu, mobile menu and filter sheet, and focus return on Escape.                                                                                                                                                                                                                                                                                                    |
| `purchase.spec.ts`       | Lenses (typed prescription, recommended thickness, coatings) to bag, checkout with PIN auto-fill, test payment, confirmation, email in Mailpit, guest tracking; a declined payment retried; a pending payment settling; cash on delivery with the prescription added afterwards; prescription errors explained; checkout validation, coupons and reload-safe drafts; axe on the configurator, bag, checkout, order and tracking pages. |
| `responsiveness.spec.ts` | INP: Event Timing for filtering, colour and saving on a 4x slowed CPU stays under 200 ms.                                                                                                                                                                                                                                                                                                                                              |

## Performance budgets

| Budget                                | Limit    | Checked by                                                                            |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Largest Contentful Paint (mobile)     | < 2.0 s  | Lighthouse CI, median of three runs                                                   |
| Cumulative Layout Shift               | < 0.05   | Lighthouse CI                                                                         |
| Interaction to Next Paint             | < 200 ms | `e2e/responsiveness.spec.ts`                                                          |
| Performance score                     | ≥ 90     | Lighthouse CI                                                                         |
| Accessibility, Best Practices, SEO    | ≥ 95     | Lighthouse CI                                                                         |
| Initial JavaScript, gzipped, per page | ≤ 170 kB | `scripts/check-js-budget.mjs` (15 pages, including bag, checkout, tracking and order) |

Lighthouse uses its mobile profile with applied throttling (ADR-024). Total Blocking Time is
reported as a warning above 200 ms.

## Coming in later phases

- **Phase 5:** try-on e2e with Chromium's fake camera (`--use-fake-device-for-media-stream`).
- **Phase 7:** visual regression baselines at three breakpoints in both themes.
