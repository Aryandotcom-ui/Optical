# Architecture

## Overview

```mermaid
flowchart LR
  subgraph Browser
    UI[Storefront and admin UI]
  end
  subgraph apps/web [apps/web · Next.js]
    RSC[Server components]
    RH[Route handlers]
  end
  subgraph apps/api [apps/api · Fastify]
    Routes --> Controllers --> Services --> Repositories
  end
  subgraph Services [Local services · Docker Compose]
    PG[(Postgres 16)]
    RD[(Redis 7)]
    MP[Mailpit SMTP]
  end
  UI -- HTML / RSC payload --> RSC
  UI -- JSON + cookies --> Routes
  RSC -- JSON, x-request-id --> Routes
  Repositories --> PG
  Services --> RD
  Services --> MP
  shared[[packages/shared · schemas, pricing, money]] -.imported by.-> apps/web
  shared -.imported by.-> apps/api
  config[[packages/config · brand, market, flags, tokens]] -.imported by.-> apps/web
  config -.imported by.-> apps/api
```

## Packages

| Path              | Purpose                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | Next.js App Router storefront and (from Phase 6) admin UI. Server components by default; client components only for interactivity.                                               |
| `apps/api`        | Fastify REST API, versioned under `/v1`. OpenAPI generated from Zod schemas and served at `/docs`.                                                                               |
| `packages/shared` | Everything client and server must agree on: Zod schemas, API contracts, money maths, and (from Phase 1) the pricing engine and prescription validation. Pure TypeScript, no I/O. |
| `packages/config` | Brand, market (currency, tax, postal codes, policies), feature flags, env validation helpers, design tokens, and shared ESLint/TypeScript/Tailwind configuration.                |

## API layering

`routes → controllers → services → repositories`

- **Routes** declare the HTTP shape: method, path, Zod schemas for params, body and responses.
- **Controllers** translate between HTTP and domain calls. No business rules.
- **Services** hold business rules and orchestrate repositories and providers. Unit-testable with fakes.
- **Repositories** are the only layer that talks to Prisma.

External dependencies (database, Redis, payments, email, storage) sit behind interfaces and are
injected into `buildApp`, so tests swap them for in-memory fakes. See `src/infra/probes.ts` for the
first example.

## Catalogue reads

```mermaid
sequenceDiagram
  participant C as Client
  participant R as Route (Zod)
  participant S as CatalogService
  participant K as Redis cache
  participant P as Postgres
  C->>R: GET /v1/products?shape=round&q=tortoise
  R->>S: list(query)
  S->>K: catalogue index (60 s)
  K-->>S: hit, or load from Postgres
  S->>P: full-text + trigram search → ranked ids
  S->>S: filter, disjunctive facets, sort, page (in memory)
  S->>P: product cards for the page's ids
  S-->>C: items, total, facets
```

Search relevance comes from Postgres; everything else runs over a compact cached index of published
products (ADR-014). The cache fails open: if Redis is down, reads go to Postgres and a warning is
logged.

## Lens pricing

The web app and the API run the same `quoteLens` and `priceOrder` from `packages/shared`. The web
app shows live prices; the API recomputes on every write and trusts only its own result. Lens
choices are stored as an immutable snapshot on cart and order items, so later catalogue changes
never alter a placed order.

## Request tracing

The web server sends `x-request-id: web-<uuid>` on every API call. The API reuses a safe incoming
ID (8 to 128 characters of `[A-Za-z0-9._:-]`), otherwise mints a UUID, echoes it in the response
header, adds it to every log line as `requestId`, and includes it in every error body so customers
can quote it to support.

## Errors

Every API error uses one envelope, `{ error: { code, message, details?, requestId } }`, with codes
from `packages/shared/src/api/errors.ts`. See [API.md](./API.md).

## Configuration

12-factor: everything comes from environment variables, validated with Zod at startup
(`packages/config/src/env.ts`). The API fails fast with a list of every problem; the web server
does the same in `instrumentation.ts`. Business settings that are not secrets (currency, tax rate,
shipping thresholds) live in `packages/config` and become admin-editable in Phase 6.

## Health

| Endpoint           | Meaning                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `GET api:/healthz` | Liveness. The process is up. Never touches dependencies.                                                         |
| `GET api:/readyz`  | Readiness. `ready`, `degraded` (Redis down, still serving, HTTP 200) or `unavailable` (database down, HTTP 503). |
| `GET web:/healthz` | Liveness of the Next.js server.                                                                                  |
| `web:/status`      | Human-readable status page built from the API probes.                                                            |
