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

| Method | Path       | Description                                                        |
| ------ | ---------- | ------------------------------------------------------------------ |
| GET    | `/healthz` | Liveness probe.                                                    |
| GET    | `/readyz`  | Readiness probe with per-dependency status and latency.            |
| GET    | `/docs`    | Interactive API reference (disable with `API_DOCS_ENABLED=false`). |
