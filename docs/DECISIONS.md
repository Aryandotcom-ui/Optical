# Architecture decisions

Short ADRs. Each records what was decided, and why, in a few lines.
New decisions are appended; superseded ones are marked, never deleted.

## ADR-001: Monorepo with pnpm workspaces and Turborepo

**Status:** accepted · Phase 0
One repository holds the storefront, the API and shared packages, so pricing rules and
validation schemas can't drift between client and server. Turborepo caches lint, typecheck,
test and build per package, so CI stays fast as the codebase grows.

## ADR-002: Toolchain versions (Node 22, TypeScript 5.9, ESLint 9)

**Status:** accepted · Phase 0
The spec asked for Node 20, but Node 20 reached end-of-life in April 2026 and Vitest 5 requires
Node ≥ 22.12, so we use Node 22 LTS. TypeScript 5.9 and ESLint 9 are the newest versions that
the whole plugin ecosystem (typescript-eslint, React and a11y plugins) supports without caveats.

## ADR-003: Internal packages ship TypeScript source

**Status:** accepted · Phase 0
`@optical/config` and `@optical/shared` export `.ts` files directly, with no build step of their own.
Next.js compiles them via `transpilePackages`, the API bundles them with tsup, and Vitest runs
them natively. This removes build-order problems and stale `dist` folders during development.

## ADR-004: Tailwind CSS v4 with a CSS-first token preset

**Status:** accepted · Phase 0
Tailwind v4 is configured in CSS, not in `tailwind.config.js`. The "Tailwind preset" is therefore
`packages/config/tailwind/preset.css`: raw palette values as `--palette-*` custom properties,
swapped under `prefers-color-scheme: dark`, and exposed as utilities through `@theme inline`.
`src/tokens.ts` mirrors the values for use in TypeScript, and a test fails if the two drift apart
or if any text/background pair drops below WCAG AA.

## ADR-005: One root `.env` for every app

**Status:** accepted · Phase 0
Next.js loads `.env` from its own folder by default. `next.config.ts` also loads the repository
root with `@next/env`, and the API walks up to the workspace root. One file to edit, and
production platforms that inject real environment variables always take precedence.

## ADR-006: `pnpm run setup` instead of `pnpm setup`

**Status:** accepted · Phase 0
`pnpm setup` is a built-in pnpm command (it configures `PNPM_HOME`) and cannot be overridden by a
package script. The one-shot command is `pnpm run setup`, with `pnpm bootstrap` as an alias.
The script uses only Node built-ins so it works before dependencies are installed.

## ADR-007: No `packages/ui` until there is a second consumer

**Status:** accepted · Phase 0
The storefront and the admin panel both live in `apps/web`, so shared UI primitives sit in
`apps/web/src/components/ui`. An empty package would add configuration without benefit. It gets
extracted if another app (for example, an email preview app) needs the same components.

## ADR-008: Content-Security-Policy arrives with MediaPipe

**Status:** accepted · Phase 0
The API already sends `default-src 'none'`. The storefront ships every other security header now,
but its CSP needs nonces for Next.js scripts plus `worker-src` and `wasm-unsafe-eval` exceptions for
MediaPipe. Writing it once the try-on code exists (Phase 5, tightened in Phase 7) avoids a policy
that is either broken or loosened to `unsafe-inline` to get by.

## ADR-009: Vendored, subsetted Inter via `next/font/local`

**Status:** accepted · Phase 0
The site must build and run offline, so Inter can't be fetched from Google Fonts at build time.
We vendor one variable WOFF2 (87 KB) that covers Latin, the rupee sign ₹ and the maths symbols
used in prescriptions. It keeps the optical-size axis, which gives display letterforms at large
sizes. `scripts/subset-font.sh` rebuilds it.

## ADR-010: Readiness separates required from optional dependencies

**Status:** accepted · Phase 0
`/readyz` returns 503 only when Postgres is unreachable. If only Redis is down it returns 200
with `degraded`: rate limiting fails open and queued jobs wait, but customers can still browse and
buy. Orchestrators then keep routing traffic instead of taking every instance out of rotation.

## ADR-011: Phase 0 readiness probe uses `pg` directly

**Status:** accepted · Phase 0 (to be superseded in Phase 1)
Prisma arrives with the data model in Phase 1. Until then, a two-connection `pg` pool answers the
database readiness check. Prisma 7's Postgres adapter uses the same driver, so this changes the
probe's implementation, not its behaviour.

## ADR-012: Prisma 7 with the `pg` driver adapter

**Status:** accepted · Phase 1
Prisma 7 is configured in `prisma.config.ts`, generates a TypeScript client into
`apps/api/src/generated` (git-ignored, rebuilt by `postinstall`), and talks to Postgres through
`@prisma/adapter-pg`. The readiness probe now pings through the same client. Migrations are
applied with `prisma migrate deploy` everywhere (setup, CI, production); new ones are authored with
`pnpm --filter @optical/api db:migrate:create`.

## ADR-013: Catalogue vocabularies are text with CHECK constraints

**Status:** accepted · Phase 1
Shapes, materials, colour families and similar lists use the hyphenated values that appear in URLs
(`cat-eye`, `rose-gold`). Prisma enums can't hold hyphens without a mapping layer, so these columns
are `text` guarded by `CHECK` constraints, and `apps/api/test/migrations.test.ts` fails if a
constraint drifts from the shared Zod enum. Workflow states (order, payment, role) stay Prisma enums.

## ADR-014: Search in Postgres, faceting in memory

**Status:** accepted · Phase 1
Relevance comes from Postgres: a trigger-maintained `tsvector` (English stemming plus `simple` for
prefix matching) and `pg_trgm` similarity for typos. Filtering, disjunctive facet counts, sorting and
paging run over a compact index of published products (a few hundred bytes each), cached in Redis
for 60 seconds. This keeps facet logic simple, testable and fast for catalogues into the thousands
of products. If the range ever grows past roughly 10,000 products, the same `runListing` contract
can be moved into SQL.

## ADR-015: Invalid lens configurations are a normal response

**Status:** accepted · Phase 1
`POST /v1/lens/quote` returns `200` with `valid: false` and reasons when a configuration is
incomplete or breaks a rule, because that is an ordinary state while someone is configuring lenses.
Only a malformed request body is a `422`. Availability of every option is always returned, so the UI
can disable options with the reason instead of hiding them.

## ADR-016: Lens compatibility rules are data, applied in both directions

**Status:** accepted · Phase 1
Rules live in the `LensRule` table as JSON (`when` conditions, `forbid` option, customer-facing
`reason`) and are evaluated by a pure function in `packages/shared`. A pairwise rule ("with 1.74,
no polarised") also blocks the other side while its forbidden option is selected, so a customer
can't reach a forbidden combination from either direction.

## ADR-017: Procedural product images rendered in headless Chromium

**Status:** accepted · Phase 1
There is no product photography, so every variant is rendered from the same parametric geometry the
3D viewer uses, with three.js in headless Chromium (software WebGL via SwiftShader), then encoded
as transparent WebP with sharp. Transparency lets one image work on light and dark backgrounds.
Patterns such as tortoise shell are painted as vertex colours from 3D noise, so meshes need no UV
maps. Renders are generated (`pnpm render:images`), incremental through a hash manifest, and never
committed. Real photos replace them by changing `ProductImage` rows.

## ADR-018: The order state machine lives in `packages/shared`

**Status:** accepted · Phase 1
The lifecycle in spec section 8.5 is a pure function (`canTransition`) with guards for frame-only
and cash-on-delivery orders. Phase 1 uses it to build consistent seed timelines; Phase 3 enforces it
in the API and Phase 6 in admin, and the web app uses the same copy to describe each status.

## ADR-019: A deterministic seed with a fixed clock

**Status:** accepted · Phase 1
The seed uses a seeded PRNG and a fixed "today" (15 September 2026), so every machine and every CI
run gets identical data, and tests can assert exact counts. It wipes the database first and refuses
to run when `NODE_ENV=production`. Sample order totals come from the real pricing engine, and their
timelines come from the state machine.

## ADR-020: Dynamic storefront pages over a cached data layer

**Status:** accepted · Phase 2
Store pages render on the server per request (the shell reads cookies and listings read the URL),
but every catalogue call goes through Next's fetch cache (`revalidate: 60`, tagged `catalog`) on
top of the API's Redis cache, so a render is a few cached reads. Listing state lives entirely in
the URL: filters are canonical query strings (`shape=round,square`), back and forward work, links
reproduce results, and "show more" renders pages 1 to N on the server. Filtered variants get
`noindex` with a canonical to the clean listing. Search queries are never cached.

## ADR-021: A 170 kB budget for initial JavaScript, and how it is met

**Status:** accepted · Phase 2
The framework alone (React DOM, the Next.js router and React Server Components) is about 138 kB
gzipped, which leaves roughly 30 kB for the store. `scripts/check-js-budget.mjs` enforces the
limit on every main route in CI. To fit:

- Browser code never imports Zod. Constants and URL helpers live in
  `@optical/shared/catalog/lite` and `@optical/shared/pricing/delivery`, and a test fails if Zod
  ever reaches those entry points.
- Code that only runs after an interaction loads on demand: dialogs (Radix Dialog behind
  `LazySheet`), the search palette (cmdk and TanStack Query), toasts (sonner, on the first toast),
  the 3D viewer (three.js).
- Native elements replace widgets where they do the job: `<details>` for filter groups, two
  range inputs for the price slider, and a disclosure button for the desktop menu (the WAI-ARIA
  pattern for site navigation) instead of Radix NavigationMenu.
- ICU messages are precompiled at build time (next-intl `precompile`), and the browser only
  receives the message namespaces client components use.
- Reviews render on the server with link-based sorting and paging (ADR-025).
- The Inter subset keeps weights 400 to 700 at the text optical size (39 kB instead of 87 kB).

Motion (Framer Motion) is not used yet: Phase 2's transitions are CSS. It returns, loaded only
where needed, when a feature calls for gestures, springs or shared-element fallbacks.

## ADR-022: `cn` joins class names without resolving conflicts

**Status:** accepted · Phase 2
tailwind-merge (about 8 kB gzipped on every page) was replaced by plain `clsx`. Components never
emit two utilities for the same property: they choose with a ternary or a `cva` variant (for
example `Button`'s `wrap`), and `className` on a primitive is for layout additions such as margin,
flex or position. `Skeleton` only applies its default radius when the caller doesn't pass one.

## ADR-023: 3D viewer from the shared parametric geometry

**Status:** accepted · Phase 2
The product viewer uses React Three Fiber with the same `buildFrameGeometry`, materials and
patterns as the renderer (ADR-017), so the model matches the photos. Lighting is generated in code
(three's `RoomEnvironment` through a PMREM generator); nothing is downloaded, so it works offline.
From drei only `OrbitControls` is used. The viewer is loaded on demand (three.js, React Three Fiber and drei, about 240 kB gzipped),
is keyboard operable (arrow keys turn, plus and minus zoom, 0 resets) and has button
alternatives to dragging (WCAG 2.5.7). The home hero upgrades from its photo to a gently swaying
model only when the page is idle on a wide screen without reduced motion or data saver, and can
be paused.

## ADR-024: Lighthouse with applied throttling; INP measured in Playwright

**Status:** accepted · Phase 2
Lighthouse CI runs the mobile profile on Home, a listing and a product page, three runs each,
with throttling applied in the browser. Lighthouse's default simulated throttling replays an
unthrottled trace; against a local HTTP/1.1 server that trace runs hydration before the hero image
paints, so the model reports an LCP of 3 s or more for a page a throttled browser paints in
1.7 s. Applied throttling measures what a slow phone actually does. INP needs real interactions,
so `e2e/responsiveness.spec.ts` measures Event Timing durations for filtering, choosing a colour
and saving on a 4x slowed CPU against the 200 ms budget; Total Blocking Time stays in Lighthouse
as a warning.

## ADR-025: Reviews are server-rendered, with links for sorting and paging

**Status:** accepted · Phase 2
Sorting (`?reviews=helpful`) and "show more" (`?reviewPage=2`) are plain links, so reviews work
without JavaScript, cost the product page no client code, and the first page is in the HTML for
search engines. The product page's canonical URL ignores these parameters.

## ADR-026: Features from later phases are not faked

**Status:** accepted · Phase 2 · lens selection and checkout shipped in Phase 3 (ADR-029–036)
Until lens selection and checkout exist (Phase 3), product pages show no "Add to cart" or "Choose
lenses" button; a short note says ordering is on its way and the wishlist keeps the frame. Try-on
and Frame Finder links appear only when those features ship (Phase 5). Help copy that mentions
later features (returns from your account, the PD tool) describes how the store will work.

## ADR-027: Legal pages are typed content generated from settings

**Status:** accepted · Phase 2
Privacy, terms, returns and shipping pages are TypeScript content modules (`src/content/legal`),
not message-catalogue strings: they are long-form documents, and every day, fee and threshold in
them is read from `packages/config`, so a policy change in settings can't leave a stale number in
a legal page. They are drafts for India and need legal review before launch (docs/LEGAL.md).

## ADR-028: Guest sessions are an opaque cookie; CSRF is checked by Origin

**Status:** accepted · Phase 3
The bag belongs to a guest session: a random 256-bit token in an `httpOnly`, `SameSite=Lax`
cookie (`Secure` in production), stored server-side only as its SHA-256. It is set lazily, on the
first add to bag or upload. Cookie-carrying writes must come from an allowed `Origin`, the API
accepts only JSON and multipart bodies (no `text/plain`, so an HTML form can't post), and
webhooks are exempt because they carry no cookies and are signed instead.

## ADR-029: Prices are snapshots, re-computed by the server and compared

**Status:** accepted · Phase 3
The configurator prices with the shared, Zod-free lens engine (`@optical/shared/lens/engine`) for
instant feedback. Adding to the bag re-quotes on the server and stores the frame price and lens
lines as an immutable snapshot; a different `expectedUnitPriceMinor` returns `PRICE_CHANGED` and
adds nothing. Placing an order recomputes the whole order and compares `expectedTotalMinor` the
same way, so the customer never pays a number they didn't see.

## ADR-030: Orders are idempotent; stock is held by conditional updates

**Status:** accepted · Phase 3
`POST /v1/checkout/orders` requires an `Idempotency-Key`; the key and a hash of the request are
stored on the order (unique index), so a retry returns the same order and a reused key with a
different body is refused. The browser keeps the key per set of order details. Stock holds and
coupon uses are conditional `UPDATE … WHERE available >= n` statements inside the order
transaction, backed by a `reserved <= onHand` check constraint: two checkouts can never take the
last frame. Holds last 15 minutes; the worker releases expired ones and cancels unpaid orders.

## ADR-031: Payment outcomes arrive only by verified webhook (or reconciliation)

**Status:** accepted · Phase 3
The browser never tells the API a payment succeeded. Every provider implements one interface
(`createIntent`, `verifyWebhook`, `fetchStatus`, `refund`); webhooks are verified against the raw
body, events are recorded in `WebhookEvent` in the same transaction that applies them, and a
duplicate is acknowledged without effect. A reconciliation job asks providers about payments
still open after two minutes, in case a webhook was lost. The mock provider follows the same path:
the simulator's choice becomes a signed webhook delivered by the worker.

## ADR-032: Hosted payment pages for Razorpay and Stripe

**Status:** accepted · Phase 3
Razorpay uses Payment Links and Stripe uses Checkout Sessions: the customer pays on the provider's
page and returns to the order page. No third-party script runs on our pages (simpler CSP, smaller
PCI scope, no extra JavaScript), and both work with the same webhook flow. Providers register only
when all their keys are set; a partly configured provider fails startup.

## ADR-033: Order links are derived from the secret, not stored

**Status:** accepted · Phase 3
Order pages are reached with `?token=`, an HMAC of the order id under `APP_SECRET`. Nothing needs
storing, links in old emails keep working, and rotating the secret revokes them all. Guest
tracking by order number and email returns the same token and answers identically for a wrong
number or a wrong email. Order pages are `noindex` and send no `Referer`.

## ADR-034: Transactional outbox and a BullMQ worker

**Status:** accepted · Phase 3
Emails are written to `EmailOutbox` in the transaction that causes them and sent by the worker
(claimed with `FOR UPDATE SKIP LOCKED`, exponential backoff, six attempts), so an order is never
saved without its email or vice versa. The worker is a separate process (`src/worker.ts`; `pnpm
dev` runs it beside the API) that also expires holds, reconciles payments and delivers mock
webhooks. Templates are React Email components with a plain-text version.

## ADR-035: Uploads are sniffed, stripped and kept private

**Status:** accepted · Phase 3
Prescription uploads are typed by magic bytes (JPEG, PNG, WebP, PDF), capped at 8 MB, stripped of
EXIF/XMP/IPTC/comments by a strict parser that rejects malformed files, passed to a malware-scan
hook, and stored outside any web root under random names with owner-only permissions. They are
read back only through five-minute HMAC-signed links, and only the browser session that uploaded
one can attach it to a bag or order. PDFs are stored unchanged (no camera or location metadata).
The S3-compatible driver arrives with deployment readiness (Phase 8); `StorageProvider` is the seam.

## ADR-036: Per-route client messages

**Status:** accepted · Phase 3
The configurator, bag, checkout and order pages need many strings. Rather than sending them to
every page from the root layout, `WithMessages` adds namespaces for one subtree, merged on the
client over the root ones. To stay within the 170 kB budget the product page loads the
configurator, and even the add-to-bag request code, on first use; address data (states, PIN
lookup) lives in `@optical/config/address`, away from the price formatting every page needs.

## ADR-037: Short JWT access tokens, rotating opaque refresh tokens, cookies only

**Status:** accepted · Phase 4
Signing in sets three cookies. `lo_access` holds a 15-minute HS256 JWT (`jose`; the key is derived
from `APP_SECRET` with HKDF so it never equals the bytes used for order links or file signatures).
`lo_refresh` holds an opaque 256-bit token, stored only as its SHA-256, valid 30 days from the last
use and sent only to `/v1/auth`. Both are httpOnly and SameSite=Strict. `lo_auth=1` is readable by
scripts and carries no secret; it only lets the shop say "signed in" without a request.

The access cookie outlives the token inside it on purpose: an expired token is reported as `401
UNAUTHENTICATED`, and the shop refreshes once and retries (one shared refresh per tab), instead of
the browser silently dropping the cookie and the bag turning into a guest bag.

Every access token names its refresh-token _family_ (one per sign-in), and every request that
acts for a customer checks the family is still live (one indexed query). Signing out, a password
change or reset, account deletion and refresh-token reuse therefore end a session at once, not
15 minutes later. Catalogue requests skip the check.

Alternatives rejected: tokens in `localStorage` (readable by any injected script); long-lived
sessions without rotation (a stolen cookie lasts for weeks); server sessions in Redis (needs Redis
for every request, and the API is meant to fail open on Redis).

## ADR-038: Refresh rotation with reuse detection and a 30-second grace

**Status:** accepted · Phase 4
Each refresh replaces the token with a new one in the same family and records `replacedById`.
Presenting a replaced token again means it was copied: the whole family is revoked (that sign-in
ends on every device holding it) and an audit entry is written. Two tabs refreshing at the same
moment would trip this, so a token replaced within the last 30 seconds is answered with a new
access token but no new refresh token; the browser keeps the newer refresh cookie the first
response set. A thief replaying inside that window gets at most one 15-minute access token and
cannot continue the session. The row is locked (`FOR UPDATE`) so one token can never be rotated
twice.

## ADR-039: Lockout with exponential backoff, on top of rate limits

**Status:** accepted · Phase 4
After five consecutive wrong passwords an account's sign-in pauses for 1 minute, then 2, 4 … up
to 60 minutes per further failure; during a pause even the right password is refused. A
successful sign-in or a password reset clears it. Per-address limits (sign-in 10 per 5 minutes,
registration 5 per hour, resets 5 per 15 minutes, refresh 30 per minute, password checks 5 per 15
minutes) slow spraying across accounts. Lockout lets someone pause another person's sign-in, so
the pause is short and capped, and the reset link always works.

## ADR-040: The guest bag and uploads follow the customer into the account

**Status:** accepted · Phase 4
A signed-in customer has exactly one bag (`Cart.userId` is unique). On sign-in or registration the
guest bag for this browser merges into it in the same transaction that issues the tokens: lines
with the same frame, lenses and price add up (to the per-item limit), others move across (to the
20-line limit), and the guest bag is deleted. Prices stay as they were when each item was added.
Prescription uploads made from this browser are attached to the account. The guest session cookie
stays, so signing out returns to an empty guest bag, not the account's.

## ADR-041: Saved prescriptions are versioned, never edited in place

**Status:** accepted · Phase 4
Updating a saved prescription adds a row pointing at its predecessor (`previousId`, `version`);
only the latest version can be edited, and orders keep pointing at the exact values their lenses
were made to. Deleting removes the whole chain from the account and erases the values and files of
versions no order uses. Expiry is the date on the prescription, or 24 months from the test date;
the worker emails one reminder within 30 days of expiry (or up to 30 days after), claimed with a
conditional update so two workers never both send it. A saved prescription is used at checkout
by id (`mode: 'saved'`), checked to belong to the customer when added and again when ordering.

## ADR-042: Order self-service on the order itself, for owners and link holders

**Status:** accepted · Phase 4
Cancel, return, buy again and the invoice live under `/v1/orders/{number}/…` and accept either the
signed-in owner or the order's access token, so guests get them too and the account pages reuse
the order page. Cancelling is allowed until production starts; it releases holds, puts committed
stock back (recorded as `StockAdjustment`), returns the coupon use and refunds an online payment
through the provider (left `PENDING` for staff if the provider fails). Returns are requested within
the return window after delivery; later steps (received, refunded) are staff actions in the admin
(Phase 6), and the email template already covers them. Invoices are rendered on request with
`pdfkit` from the order's own snapshot; built-in Helvetica has no rupee sign, so amounts read
"INR 1,234.00".
