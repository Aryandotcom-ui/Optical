# Testing

## Commands

| Command              | What it runs                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- |
| `pnpm test`          | Every package's unit and integration tests (Vitest), in parallel through Turborepo. |
| `pnpm test:coverage` | The same, with V8 coverage. `packages/shared` and `apps/api` fail below 80%.        |
| `pnpm lint`          | ESLint with type-aware rules, React, hooks, jsx-a11y and Next.js rules.             |
| `pnpm typecheck`     | `tsc --noEmit` in every package.                                                    |
| `pnpm check`         | lint, typecheck, test and build, in that order. Run it before pushing.              |

Run a single package with `pnpm --filter @optical/api test`, or watch mode with
`pnpm --filter @optical/shared exec vitest`.

## What is tested where

| Package           | Focus                                                                                                                                                                    | Style                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `packages/config` | Env validation, feature-flag parsing, postal codes, design-token drift and WCAG contrast.                                                                                | Unit                     |
| `packages/shared` | Money maths and the API contract. Property-based tests (fast-check) for invariants such as "tax + net = gross".                                                          | Unit + property          |
| `apps/api`        | HTTP behaviour through `app.inject()`: probes, request IDs, error envelope, CORS, security headers, OpenAPI. Dependencies are injected fakes, so no services are needed. | Integration (in-process) |
| `apps/web`        | Components (Testing Library + jsdom), the server API client, status derivation, and copy rules (no exclamation marks, no hard-coded brand name).                         | Unit + component         |

## Coming in later phases

- **Phase 1:** API tests against a real Postgres (`optical_test` database, created by the Docker init script).
- **Phase 2:** Playwright end-to-end tests with axe accessibility checks, and Lighthouse CI budgets.
- **Phase 5:** try-on e2e with Chromium's fake camera (`--use-fake-device-for-media-stream`).
- **Phase 7:** visual regression baselines at three breakpoints in both themes.

## Phase 0 manual checks

Browser checks run against `pnpm dev` with Chromium and axe-core: `/`, `/status`,
`/dev/design-system` and the 404 page are free of WCAG 2.2 AA violations in light and dark mode
at 1440 px and 390 px, with no horizontal scroll and no console errors. Phase 2 turns these into
committed Playwright tests.
