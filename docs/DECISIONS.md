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
