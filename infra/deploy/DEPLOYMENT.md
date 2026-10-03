# Deployment

The platform is three processes built from one repository, plus Postgres, Redis and an SMTP
server. Production configuration is **environment variables only**: the same images run on a
laptop, a single VM or a container platform.

```
                   ┌──────────────── TLS proxy / load balancer (HSTS, gzip) ────────────────┐
  shop.example.com │                                                                        │ api.shop.example.com
                   ▼                                                                        ▼
            ┌─────────────┐   server-side calls (API_INTERNAL_URL)   ┌─────────────┐
            │ web :3000   │ ───────────────────────────────────────▶ │ api :4000   │◀── payment webhooks
            │ Next.js     │                                          │ Fastify     │
            └─────────────┘                                          └──────┬──────┘
                                                                            │
                     ┌───────────────┬───────────────────┬──────────────────┤
                     ▼               ▼                   ▼                  ▼
               ┌──────────┐    ┌──────────┐       ┌────────────┐     ┌────────────┐
               │ Postgres │    │  Redis   │◀──────│ worker     │────▶│ SMTP       │
               └──────────┘    └──────────┘ jobs  │ (BullMQ)   │     └────────────┘
                                                  └────────────┘
       uploads volume (prescriptions, product photos): shared by api and worker
```

| Image             | Target    | Runs                                                       |
| ----------------- | --------- | ---------------------------------------------------------- |
| `optical-web`     | `web`     | Next.js standalone server on port 3000                     |
| `optical-api`     | `api`     | The HTTP API on port 4000 (`/healthz`, `/readyz`)          |
| `optical-worker`  | `worker`  | Emails, stock holds, payment reconciliation, reminders     |
| `optical-migrate` | `migrate` | One-off: `prisma migrate deploy` (also runs the demo seed) |

## 1. Configure

```sh
cp infra/deploy/production.env.example infra/deploy/production.env
openssl rand -base64 48        # paste as APP_SECRET
pnpm preflight --env-only      # checks the file; `pnpm preflight` also runs every CI gate
```

Every variable is documented in `.env.example`. The ones that matter for production:

| Variable                                      | Notes                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `REDIS_URL`                   | Postgres 16+ and Redis 7+. Managed services are fine (`rediss://` for TLS).            |
| `APP_SECRET`                                  | ≥ 32 random characters. Rotating it signs everyone out and expires order/upload links. |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL` | Public HTTPS origins. **Also build arguments of the web image** (see below).           |
| `API_PUBLIC_URL`, `CORS_ALLOWED_ORIGINS`      | The API's public origin; the shop's origin must be in the CORS list.                   |
| `API_INTERNAL_URL`                            | How the web server and worker reach the API on the private network.                    |
| `COOKIE_DOMAIN`                               | Set to the parent domain (`.shop.example.com`) when shop and API are on subdomains.    |
| `TRUST_PROXY=true`                            | Behind a proxy, so rate limits and logs see the client's IP.                           |
| `SMTP_URL`, `EMAIL_FROM`                      | A transactional email provider's SMTP endpoint.                                        |
| `RAZORPAY_*` or `STRIPE_*`                    | One provider's keys, all together. Without one, only cash on delivery is offered.      |
| `API_DOCS_ENABLED=false`                      | Hides `/docs` in production.                                                           |

The shop and API must share a site (same registrable domain) because sign-in cookies are
`SameSite=Strict` (ADR-037). Payment webhooks go to `https://<api>/v1/webhooks/<provider>`;
register that URL and its secret with the provider.

## 2. Build the images

```sh
docker build -f infra/docker/Dockerfile --target api     -t optical-api .
docker build -f infra/docker/Dockerfile --target worker  -t optical-worker .
docker build -f infra/docker/Dockerfile --target migrate -t optical-migrate .
docker build -f infra/docker/Dockerfile --target web     -t optical-web \
  --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com \
  --build-arg NEXT_PUBLIC_API_URL=https://api.shop.example.com .
```

or `docker compose -f infra/deploy/docker-compose.prod.yml build`, which reads the two
`NEXT_PUBLIC_*` values from the shell. Next.js compiles `NEXT_PUBLIC_*` into the browser bundle
and the Content-Security-Policy, so the **web image is built per public domain**; everything else
is read at start-up. Options:

- `--build-arg NODE_IMAGE=…` to use a registry mirror for `node:22-bookworm-slim`.
- `--secret id=ca,src=ca.pem` if the build runs behind a TLS-inspecting proxy (never stored in a
  layer).
- Product photos come from `pnpm render:images` (needs Chromium, no database). Run it before
  building the web image so `apps/web/public/renders` is in the build context; without it,
  products show a neutral silhouette.

## 3. Run

Single host with Docker Compose (Postgres and Redis included):

```sh
docker compose -f infra/deploy/docker-compose.prod.yml up -d --wait
```

`migrate` applies pending migrations and exits; the API, worker and shop start once it has
succeeded and the data stores are healthy. Ports bind to 127.0.0.1: put a TLS proxy (Caddy,
nginx, a cloud load balancer) in front and set HSTS there.

On a container platform, run the same images with the same variables: `migrate` as a release
or pre-deploy job, `api` and `web` as services behind HTTPS with health checks on `/readyz` and
`/healthz`, and `worker` as a background service. Run one worker (BullMQ schedules are shared, so
more are safe but unnecessary). The API and worker share the uploads directory (`UPLOAD_DIR`):
use a persistent volume mounted in both, or a network filesystem when running several API
replicas.

### Local trial in production mode

```sh
cp infra/deploy/production.env.example infra/deploy/production.env  # set APP_SECRET and the passwords
docker compose -f infra/deploy/docker-compose.prod.yml --profile local-mail up -d --build --wait
docker compose -f infra/deploy/docker-compose.prod.yml run --rm \
  -e SEED_ALLOW_PRODUCTION=true migrate pnpm db:seed     # demo catalogue and accounts
```

The shop is on http://localhost:3000, the admin on http://localhost:3000/admin, and Mailpit on
http://localhost:8025. Checkout offers cash on delivery (the mock payment provider is refused
in production by design). **Never seed a real database**: the seed deletes all data.

## 4. Release checklist

1. `pnpm preflight` passes (environment, format, lint, typecheck, tests with coverage, build).
2. CI is green on the commit, including the e2e suite and Lighthouse budgets.
3. Back up the database (`pg_dump -Fc`), then deploy: migrate, then api and worker, then web.
4. Smoke test: `/readyz` is `ok`, the home page and a product page load, an admin can sign in,
   a test order (cash on delivery, then cancelled in the admin) sends its emails.
5. Watch the logs (`requestId` ties web, API and worker lines together) and the error rate.

## Operations

- **Backups:** nightly `pg_dump -Fc` plus the uploads volume; test a restore each quarter.
- **Migrations** are forward-only and additive where possible; roll back by deploying the previous
  images (a migration that removes data ships only after the code stops using it).
- **Logs** are JSON on stdout (pino); ship them to your log store.
- **Secrets** rotate by changing the variable and restarting; `APP_SECRET` rotation signs everyone
  out.
- **Scaling:** web and API are stateless (sessions are signed cookies; caches live in Redis); scale
  them horizontally. Admin settings are cached for 10 seconds per process, so a change reaches every replica within that time. Postgres is the only stateful core.
