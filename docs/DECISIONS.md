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
