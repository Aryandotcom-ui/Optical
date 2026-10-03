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
| `pnpm --filter @optical/web lhci`      | Lighthouse CI budgets on Home, a listing, a product page and Frame Finder.          |

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
mobile (Pixel 7) project, plus a `camera` project for try-on (below):

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

| Spec                     | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browse.spec.ts`         | No popups on arrival; filters in the URL (shared links, back/forward); empty-state recovery; product colour, delivery estimate, JSON-LD; 404.                                                                                                                                                                                                                                                                                                                                       |
| `saved.spec.ts`          | Wishlist from a card to the wishlist page; compare two frames with differences marked.                                                                                                                                                                                                                                                                                                                                                                                              |
| `search.spec.ts`         | The palette with a typo ("titanum") to results.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `a11y.spec.ts`           | axe (WCAG 2.2 AA) on 20 pages (try-on and Frame Finder steps and results included) in light and dark, plus the open mega menu, mobile menu and filter sheet, and focus return on Escape.                                                                                                                                                                                                                                                                                            |
| `purchase.spec.ts`       | Lenses (typed prescription, recommended thickness, coatings) to bag, checkout with PIN auto-fill, test payment, confirmation, email in Mailpit, guest tracking; a declined payment retried; a pending payment settling; cash on delivery with the prescription added afterwards; prescription errors explained; checkout validation, coupons and reload-safe drafts; axe on the configurator, bag, checkout, order and tracking pages.                                              |
| `frame-finder.spec.ts`   | Frame Finder's five steps (one skipped) to ranked frames with match scores and reasons; removing and switching answers in place, undone with back; shared links restoring answers; the whole flow with JavaScript off; the home try-on preview never asking for the camera.                                                                                                                                                                                                         |
| `camera.spec.ts`         | `camera` project only. Try-on tracks the fake-camera face, switches frames with arrow keys, compares two with the divider, mirrors, saves a PNG and turns the camera off; a denied camera falls back to a photo, which is tracked too; no WebGL explains itself; try-on over a product page keeps the page and the session; face shape from the camera; PD from the iris and from card markers. Every test also fails on any request that sends a body, so nothing leaves the page. |
| `responsiveness.spec.ts` | INP: Event Timing for filtering, colour and saving on a 4x slowed CPU stays under 200 ms.                                                                                                                                                                                                                                                                                                                                                                                           |

## Performance budgets

| Budget                                | Limit    | Checked by                                                                                        |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| Largest Contentful Paint (mobile)     | < 2.0 s  | Lighthouse CI, median of three runs                                                               |
| Cumulative Layout Shift               | < 0.05   | Lighthouse CI                                                                                     |
| Interaction to Next Paint             | < 200 ms | `e2e/responsiveness.spec.ts`                                                                      |
| Performance score                     | ≥ 90     | Lighthouse CI                                                                                     |
| Accessibility, Best Practices, SEO    | ≥ 95     | Lighthouse CI                                                                                     |
| Initial JavaScript, gzipped, per page | ≤ 170 kB | `scripts/check-js-budget.mjs` (23 pages, including try-on, Frame Finder, bag, checkout and order) |

Lighthouse uses its mobile profile with applied throttling (ADR-024). Total Blocking Time is
reported as a warning above 200 ms.

## Coming in later phases

- **Phase 7:** visual regression baselines at three breakpoints in both themes.

## Try-on in tests

The `camera` project launches Chromium with a fake camera that plays `e2e/fixtures/face.png` (made
into `e2e/.generated/face.y4m` by the global setup on first run), grants the camera permission, and
runs full Chromium (new headless mode, not the headless shell) with ANGLE on SwiftShader, so WebGL 2
works without a GPU. Its first test fails with a plain message if the browser has no WebGL 2. A denied camera and a missing WebGL are
simulated with init scripts, so every fallback is exercised. In this setup MediaPipe runs on the
CPU (ADR-043) and tracks within a few seconds.

## Try-on frame rate

Targets: **≥ 30 fps on a laptop and ≥ 24 fps on a phone**, for the whole loop (track, smooth,
draw). The page reports its own measured rate in `data-fps` (with `data-delegate` and
`data-quality`), and `pnpm --filter @optical/web measure:try-on [url] [--mobile] [--gpu]
[--cpu-slowdown=4]` samples it for 15 seconds after a 5-second warm-up, using the fake camera.

Measured on 3 October 2026 in the development container (4 vCPU, **no GPU**: WebGL on SwiftShader,
so MediaPipe runs on the CPU delegate), production build:

| Profile                         | Delegate | Quality level reached | Median fps | Range |
| ------------------------------- | -------- | --------------------- | ---------- | ----- |
| 1280 × 800                      | CPU      | 2 (lowest)            | 15         | 14–16 |
| Pixel 7 screen                  | CPU      | 2 (lowest)            | 13         | 11–14 |
| Pixel 7 screen, 4× CPU slowdown | CPU      | 2 (lowest)            | 6          | 5–6   |

**The targets are not met, and not verifiable, on this hardware.** The loop is bound by face
inference on the CPU (about 50 ms a frame here, which by itself caps it near 20 fps; the GPU
delegate on SwiftShader was slower still, about 280 ms). The renderer had already stepped down to
its lowest quality level. Real laptops and phones run the GPU delegate on real graphics hardware,
which this container cannot test.

Before launch, measure on reference devices (for example a 2020-or-later laptop with integrated
graphics, and a mid-range Android phone over USB with `chrome://inspect`). Open `/try-on`, start the
camera and read `data-fps` on the try-on element, or run the script above with `--gpu` on a laptop.
`/dev/try-on-debug` (development builds only) shows the tracker's own speed and delegate per frame.
If a device falls short, the next step is running the tracker in a Web Worker, so drawing no longer
waits for inference.

## Admin

- `apps/api/test/admin.test.ts`: RBAC (customer, staff and admin on every area), role changes,
  catalogue create/publish/upload, lens edits, review moderation, prescription approve and
  correction (with emails), settings and flags, coupons and help articles, and audit entries.
- `e2e/admin.spec.ts` (desktop): a shopper orders and types a prescription; staff approve it and
  the order moves into production with an email in Mailpit; staff can't open admin-only pages;
  an admin adjusts stock and finds it in the audit log; axe runs on the admin pages.
