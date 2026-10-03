# Security review

A checklist of the controls in place, where each lives, and how it is tested. Reviewed at the
end of Phase 7; re-run it before each release. To report a vulnerability, see the root
[`SECURITY.md`](../SECURITY.md).

## Checklist

| Area          | Control                                                                                                                                                                | Where                                       | Tested by                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Passwords     | argon2id with OWASP minimum parameters; breached-length and strength rules; generic sign-in errors                                                                     | `apps/api/src/lib/password.ts`, auth module | `auth.test.ts`                                               |
| Brute force   | Per-account lockout after repeated failures; per-IP rate limits on sign-in, registration, reset, checkout, uploads and admin writes                                    | `lib/rate-limit.ts`                         | `auth.test.ts`, `http-contract.test.ts`                      |
| Sessions      | Short-lived access JWT and rotating refresh token in `HttpOnly`, `Secure` (production), `SameSite=Strict` cookies; reuse of a rotated refresh token revokes the family | auth module (ADR-037)                       | `auth.test.ts`                                               |
| CSRF          | SameSite=Strict plus an `Origin` check on every state-changing request                                                                                                 | `plugins/csrf.ts`                           | `http-contract.test.ts`, `cart.test.ts`                      |
| Authorisation | Customers only see their own data; guest orders need a signed, expiring link; the admin re-reads the role on every request and refuses non-staff before validation     | ADR-051                                     | `account.test.ts`, `infra-checkout.test.ts`, `admin.test.ts` |
| Audit         | Every admin change writes who, what, before and after in the same transaction                                                                                          | ADR-052                                     | `admin.test.ts`                                              |
| Input         | Every route validates params, query and body with Zod; unknown keys are stripped                                                                                       | route schemas                               | API tests (422 cases)                                        |
| Uploads       | Type from magic bytes, size limits, EXIF/XMP/IPTC stripped, random storage keys, private files served only through short-lived signed URLs                             | `lib/file-sanitiser.ts`, storage            | `file-sanitiser.test.ts`, `prescriptions.test.ts`            |
| Payments      | Provider webhooks verified by HMAC signature and idempotent; amounts recomputed on the server, never trusted from the browser                                          | payments module                             | `providers.test.ts`, `checkout.test.ts`                      |
| Output        | React escapes by default; the only raw HTML is JSON-LD, serialised with `<` escaped; CSV exports neutralise formulas                                                   | `structured-data.ts`, ADR-054               | `seo.test.ts`, `list.test.ts`                                |
| Headers (web) | CSP (ADR-056), `X-Frame-Options: DENY`, `nosniff`, strict referrer, COOP, a Permissions-Policy that allows only the camera (same origin)                               | `apps/web/next.config.ts`                   | `e2e/hardening.spec.ts`                                      |
| Headers (API) | Helmet defaults, `Cache-Control: no-store` on account, checkout, order and admin responses, strict CORS to the shop origin                                             | `plugins/security.ts`                       | `http-contract.test.ts`, `health.test.ts`                    |
| Privacy       | Try-on, face shape and PD run on the device: no images or landmarks are sent or stored; MediaPipe's usage logging is patched off                                       | ADR-043, ADR-045                            | `mediapipe-patch.test.ts`, camera e2e                        |
| Secrets       | Only `.env.example` is committed; `APP_SECRET` must be ≥ 32 characters; the API refuses to start in production with the mock payment provider enabled                  | `apps/api/src/config/env.ts`                | `env.test.ts`                                                |
| Dependencies  | Lockfile committed; weekly `pnpm audit --prod` in CI; patched dependencies listed in `patches/`                                                                        | `.github/workflows/weekly-audit.yml`        | CI                                                           |
| Data rights   | Account export and deletion (orders kept anonymised for tax law)                                                                                                       | account module                              | `account.test.ts`                                            |

## Known limitations

- `script-src` allows `'unsafe-inline'` because Next.js streams page data in inline scripts and
  per-request nonces would make every page uncacheable (ADR-056). Other sources are locked down.
- HSTS is set by the TLS-terminating proxy in front of the apps, not by the apps (`infra/deploy/DEPLOYMENT.md`).
- Rate limits are per IP; behind a proxy, `TRUST_PROXY` must be set so the client IP is real.
- There is no second factor for team accounts yet; use strong, unique passwords and keep the
  number of ADMIN accounts small.
