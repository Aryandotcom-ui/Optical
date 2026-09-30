# Lumen Optics

An eyewear store: prescription glasses, sunglasses and computer glasses, with lenses explained in
plain language, honest pricing, and on-device virtual try-on.

This repository is a TypeScript monorepo with a Next.js storefront, a Fastify API and shared
packages. It runs fully locally with no paid services or API keys.

> **Status: Phase 1 (data and API core).** The data model, a deterministic demo catalogue of 64
> frames, the catalogue, search and lens-pricing API, the shared pricing engine and procedurally
> rendered product images are in place. The storefront UI arrives in Phase 2; see
> [the roadmap](#roadmap).

## Quick start

**Prerequisites:** Node 22.12+ (`nvm use` reads `.nvmrc`), pnpm 10 (`corepack enable`), Docker.

```bash
pnpm run setup   # install, .env, Docker services, migrate, seed, render product images
pnpm dev         # web on :3000, API on :4000, both with hot reload
```

> `pnpm setup` (without `run`) is a built-in pnpm command, so use `pnpm run setup` or
> `pnpm bootstrap`. See [ADR-006](docs/DECISIONS.md).
>
> The first run renders about 615 product images in headless Chromium, which takes several
> minutes; later runs only redraw what changed. Use `pnpm run setup --skip-assets` to skip it and
> run `pnpm setup:assets` later.

| What                     | Where                                   |
| ------------------------ | --------------------------------------- |
| Storefront               | http://localhost:3000                   |
| System status            | http://localhost:3000/status            |
| Design system (dev only) | http://localhost:3000/dev/design-system |
| API                      | http://localhost:4000                   |
| API reference            | http://localhost:4000/docs              |
| Mailpit inbox            | http://localhost:8025                   |

## Scripts

| Command                                          | Does                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm run setup`                                 | One-time setup. `--skip-install`, `--skip-docker` and `--skip-assets` are available. |
| `pnpm dev`                                       | Runs web and API in watch mode.                                                      |
| `pnpm build`                                     | Production builds of every app.                                                      |
| `pnpm start`                                     | Runs the production builds.                                                          |
| `pnpm lint`                                      | ESLint (type-aware, React, a11y, Next.js).                                           |
| `pnpm typecheck`                                 | TypeScript in every package.                                                         |
| `pnpm test`                                      | Vitest in every package. API integration tests need `pnpm docker:up`.                |
| `pnpm test:coverage`                             | Tests with coverage thresholds.                                                      |
| `pnpm check`                                     | lint, typecheck, test, build. Run before pushing.                                    |
| `pnpm format` / `format:check`                   | Prettier.                                                                            |
| `pnpm docker:up` / `docker:down` / `docker:logs` | Local services.                                                                      |
| `pnpm db:migrate`                                | Applies pending migrations (`prisma migrate deploy`).                                |
| `pnpm db:seed`                                   | Wipes and reseeds the demo data. Refuses to run in production.                       |
| `pnpm db:reset`                                  | Drops everything, re-migrates and reseeds.                                           |
| `pnpm db:studio`                                 | Opens Prisma Studio to browse the data.                                              |
| `pnpm render:images`                             | Renders product images. `--force` redraws all, `--only=<slug>` one product.          |
| `pnpm setup:assets`                              | Ensures Chromium is available, then renders images.                                  |

End-to-end tests (`test:e2e`) arrive with the storefront in Phase 2.

## Demo data

The seed is deterministic, so every machine gets the same data:

- 64 frames in 8 shapes (eyeglasses, sunglasses, computer glasses, kids) with 214 colour
  variants, real measurements and honest stock levels, plus 5 accessories
- the full lens catalogue: 5 lens types, 5 materials, 5 coatings in 3 packages, 5 tints, 7 rules
- 15 sample orders covering every order status, 107 reviews, 4 coupons (`WELCOME10`, `FREESHIP`,
  `FLAT300`, and the expired `MONSOON15`), 6 collections and 12 help articles

Demo accounts, for local development only:

| Role     | Email               | Password          |
| -------- | ------------------- | ----------------- |
| Admin    | `admin@example.com` | `Admin#Lumen2026` |
| Staff    | `staff@example.com` | `Staff#Lumen2026` |
| Customer | `asha@example.com`  | `Asha#Lumen2026`  |
| Customer | `rahul@example.com` | `Rahul#Lumen2026` |

## API

Browse the interactive reference at http://localhost:4000/docs. Conventions, error codes and
endpoint details are in [docs/API.md](docs/API.md). For example:

```bash
curl 'http://localhost:4000/v1/products?category=sunglasses&shape=aviator&sort=price-asc'
curl 'http://localhost:4000/v1/search/suggest?q=titanum'   # typo-tolerant
```

## Architecture

```mermaid
flowchart LR
  B[Browser] --> W[apps/web<br/>Next.js]
  B -- JSON + cookies --> A[apps/api<br/>Fastify]
  W -- server-side JSON --> A
  A --> P[(Postgres 16)]
  A --> R[(Redis 7)]
  A --> M[Mailpit SMTP]
  S[[packages/shared]] -.-> W & A
  C[[packages/config]] -.-> W & A
```

- `apps/web` is the storefront (and later the admin panel)
- `apps/api` is the REST API, with OpenAPI generated from Zod schemas
- `packages/shared` holds the schemas, API contracts and money maths that both apps import
- `packages/config` holds brand, market (currency, tax, postal codes, shipping zones), feature flags, env validation, design tokens, and the lint and TypeScript presets
- `packages/shared` also holds the pricing engine, prescription validation, lens rules, the order state machine and the parametric frame geometry
- `scripts` holds setup, asset and product-image rendering tools

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Decisions are recorded in
[docs/DECISIONS.md](docs/DECISIONS.md), and assumptions in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

## Configuration

Every variable is documented in [`.env.example`](.env.example): its purpose, its default, whether
it is required, and which app reads it. Both apps read the root `.env` and validate it at startup.
A bad value stops the app with a message naming each problem.

Brand name, currency, tax rate, shipping thresholds and store policies live in
[`packages/config/src`](packages/config/src). Change them there, never in components.

## Troubleshooting

**Docker isn't running.** `pnpm run setup` stops and tells you so. Start Docker Desktop (or
`dockerd`) and run it again. To use your own Postgres 16 and Redis 7, set `DATABASE_URL` and
`REDIS_URL` in `.env` and run `pnpm run setup --skip-docker`.

**A port is busy.** Change `POSTGRES_PORT`, `REDIS_PORT` or `MAILPIT_*` in `.env`, update
`DATABASE_URL` / `REDIS_URL` to match, then run `pnpm docker:up`. For the apps, stop whatever is
using port 3000 or 4000, or change `API_PORT` (and `NEXT_PUBLIC_API_URL`).

**The status page says the API is unavailable.** Check that `pnpm dev` shows the API listening
on :4000, and that `API_INTERNAL_URL` (or `NEXT_PUBLIC_API_URL`) points at it.

**"Invalid environment" on startup.** The message lists every variable that is missing or
malformed. Compare your `.env` with `.env.example`.

**Product images fail to render.** Rendering needs Chrome or Chromium. `pnpm setup:assets`
downloads one through Playwright if none is found; behind a proxy, set `CHROMIUM_PATH` in `.env`
to an existing browser instead. The site works without the images; they only affect product
cards and galleries.

**API tests fail with a database error.** They need Postgres and Redis running (`pnpm docker:up`)
and use the separate `optical_test` database. See [docs/TESTING.md](docs/TESTING.md).

**Camera access.** Browsers allow the camera only on `https://` or `http://localhost`. If you open
the site at a LAN IP address (for example from a phone), try-on needs HTTPS. Try-on arrives in Phase 5.

## Roadmap

| Phase | Scope                                                                     | State |
| ----- | ------------------------------------------------------------------------- | ----- |
| 0     | Foundations: monorepo, tooling, tokens, env validation, health checks, CI | Done  |
| 1     | Data model, seed, catalogue/search/lens-quote API, pricing engine         | Next  |
| 2     | Storefront browsing: shell, home, listings, product pages, 3D viewer      |       |
| 3     | Lens configurator, cart, checkout, payments, emails                       |       |
| 4     | Auth and account area                                                     |       |
| 5     | Virtual try-on and Frame Finder                                           |       |
| 6     | Admin panel                                                               |       |
| 7     | Hardening and polish                                                      |       |
| 8     | Deployment readiness and handoff                                          |       |

## Licence

MIT. See [LICENSE](LICENSE). Third-party assets are listed in [docs/ASSETS.md](docs/ASSETS.md).
