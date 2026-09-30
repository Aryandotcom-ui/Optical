# API reference

The interactive reference is generated from the route schemas and served at
**http://localhost:4000/docs** (raw OpenAPI 3.1 JSON at `/docs/json`). This page covers the
conventions every endpoint follows.

## Conventions

- JSON in and out. Request bodies are validated with Zod; unknown content types return 415.
- Business endpoints are versioned under `/v1` (from Phase 1). Probes (`/healthz`, `/readyz`) are not versioned.
- Money is always an integer number of minor units (paise for INR), never a float.
- Every response carries `x-request-id`. Send your own (8 to 128 characters of `[A-Za-z0-9._:-]`) to trace a call end to end.
- Request bodies are capped at 1 MiB. File uploads (Phase 3) have their own limit.

## Error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields need attention.",
    "details": [{ "path": "body.email", "message": "Invalid email address" }],
    "requestId": "7f0c1c6e-5a4b-4c1e-9f55-2f5d8a1d9c3b"
  }
}
```

`message` is safe to show to customers. `details` appears only when there is something per-field
to say. Internal failures never leak stack traces or messages; they return `INTERNAL_ERROR` and
the full error is logged against the request ID.

## Error codes

Clients branch on `code`, never on `message`.

| Code                     | HTTP | When                                                                |
| ------------------------ | ---- | ------------------------------------------------------------------- |
| `BAD_REQUEST`            | 400  | The request could not be read, e.g. malformed JSON.                 |
| `UNAUTHENTICATED`        | 401  | Sign-in required, or the session has expired.                       |
| `FORBIDDEN`              | 403  | Signed in, but not allowed to do this.                              |
| `NOT_FOUND`              | 404  | No such route or resource.                                          |
| `METHOD_NOT_ALLOWED`     | 405  | The route exists but not for this method.                           |
| `CONFLICT`               | 409  | The request clashes with current state, e.g. a coupon already used. |
| `PAYLOAD_TOO_LARGE`      | 413  | Body or upload over the limit.                                      |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | Content type not accepted by this route.                            |
| `VALIDATION_FAILED`      | 422  | Well-formed request with invalid fields; see `details`.             |
| `RATE_LIMITED`           | 429  | Too many requests; retry after the `retry-after` header.            |
| `INTERNAL_ERROR`         | 500  | Unexpected failure on our side.                                     |
| `SERVICE_UNAVAILABLE`    | 503  | A required dependency is down.                                      |

The source of truth is `packages/shared/src/api/errors.ts`; a test checks every code maps to a status.

## Endpoints available now

| Method | Path                        | Description                                                                                    |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/healthz`                  | Liveness probe.                                                                                |
| GET    | `/readyz`                   | Readiness probe with per-dependency status and latency.                                        |
| GET    | `/docs`                     | Interactive API reference (disable with `API_DOCS_ENABLED=false`).                             |
| GET    | `/v1/products`              | Listing with filters, disjunctive facet counts, sort and pagination. See below.                |
| GET    | `/v1/products/{slug}`       | Product detail: variants, images, stock state, measurements, face-shape fit, collections, SEO. |
| GET    | `/v1/products/{id}/related` | Up to 8 similar products (same category; shape, material, style and price).                    |
| GET    | `/v1/categories`            | Categories with live product counts.                                                           |
| GET    | `/v1/collections/{slug}`    | A collection with its products in editorial order.                                             |
| GET    | `/v1/search/suggest?q=`     | Instant, typo-tolerant suggestions: products, categories, collections, help articles.          |
| GET    | `/v1/lens/options`          | The full lens catalogue: lens types, materials, coatings, packages, tints and rules.           |
| POST   | `/v1/lens/quote`            | Prices a lens configuration for a frame; see below.                                            |

### Listing parameters (`GET /v1/products`)

| Parameter                                                  | Values                                                                 | Notes                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `category`                                                 | `eyeglasses`, `sunglasses`, `computer-glasses`, `kids`, `accessories`  |                                                                               |
| `q`                                                        | free text, up to 80 characters                                         | Full-text with stemming, prefixes and typo tolerance.                         |
| `shape`, `material`, `size`, `colour`, `fit`, `collection` | one or more values                                                     | Repeat the key or separate with commas. OR within a facet, AND across facets. |
| `feature`                                                  | `spring-hinges`, `nose-pads`, `lightweight`, `adjustable`              | Every selected feature must be present.                                       |
| `minPrice`, `maxPrice`                                     | integer minor units                                                    | Inclusive.                                                                    |
| `minRating`                                                | 1–5                                                                    |                                                                               |
| `inStock`                                                  | `true`                                                                 | Hides products with no available variant.                                     |
| `sort`                                                     | `recommended` (default), `newest`, `price-asc`, `price-desc`, `rating` | With `q`, recommended means most relevant.                                    |
| `page`, `pageSize`                                         | page ≥ 1 (max 100), pageSize 1–48 (default 24)                         |                                                                               |

Unknown values are rejected with `422` rather than ignored, so a broken link is noticed.
Facet counts are **disjunctive**: each facet counts products that match every other active filter,
so selecting "round" still shows how many "square" frames adding it would give. Stock is honest:
`lowStockCount` is only present when a variant genuinely has three or fewer units.

Listing and product responses carry `Cache-Control: public, max-age=30, stale-while-revalidate=120`;
search responses are `no-store`.

### Lens quote (`POST /v1/lens/quote`)

```json
{
  "productId": "0192…",
  "config": {
    "purpose": "single-vision",
    "prescription": {
      "mode": "manual",
      "rx": {
        "right": { "sph": -2.25 },
        "left": { "sph": -2 },
        "pd": { "kind": "single", "value": 63 }
      }
    },
    "indexCode": "1.61",
    "packageCode": "complete",
    "extraCoatingCodes": [],
    "tint": null
  }
}
```

The response is always `200` for a well-formed request. `valid: true` returns the normalised
configuration (store this as the snapshot), itemised `lines`, `totalMinor`, prescription warnings,
an index recommendation with a plain-language reason, and thickness estimates per index.
`valid: false` returns `errors` (each with `path`, `code` and a customer-safe `message`). Both
include `availability` for every option with the reason an option is disabled. `prescription.mode`
may also be `upload`, `saved` or `later` (the order waits for the prescription).
