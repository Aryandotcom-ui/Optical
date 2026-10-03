# Production images for the API, the background worker and the storefront.
# Build from the repository root:
#
#   docker build -f infra/docker/Dockerfile --target api    -t optical-api .
#   docker build -f infra/docker/Dockerfile --target worker -t optical-worker .
#   docker build -f infra/docker/Dockerfile --target web    -t optical-web \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.shop.example.com .
#
# Everything else is configured at run time with environment variables
# (infra/deploy/DEPLOYMENT.md).

# Any Node 22 Debian image works; pass e.g. a registry mirror with --build-arg.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm CI=1 NEXT_TELEMETRY_DISABLED=1
# An optional `--secret id=ca,src=<bundle.pem>` trusts a TLS-inspecting proxy
# during the build; it is never stored in an image layer.
RUN --mount=type=secret,id=ca \
    if [ -f /run/secrets/ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi; \
    npm install --global --no-fund --no-audit pnpm@10.33.0
WORKDIR /repo

# ── Install and build everything once ───────────────────────────────────
FROM base AS build
# Manifests first, so the dependency layer is cached until they change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY patches ./patches
COPY apps/api/package.json apps/api/prisma.config.ts ./apps/api/
COPY apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY scripts/package.json ./scripts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=ca \
    if [ -f /run/secrets/ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile --filter "@optical/api..." --filter "@optical/web..." --filter optical
COPY . .
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm --filter @optical/api db:generate \
 && pnpm --filter @optical/api build \
 && pnpm --filter @optical/web build
# A self-contained copy of the API's production dependencies.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=ca \
    if [ -f /run/secrets/ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi; \
    pnpm --filter @optical/api deploy --prod --legacy /deploy/api \
 && rm -rf /deploy/api/dist && cp -r apps/api/dist /deploy/api/dist

# ── API and worker: the same bundle, two entry points ──────────────────
FROM ${NODE_IMAGE} AS runtime-api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /deploy/api ./
RUN mkdir -p /data/uploads && chown node:node /data/uploads
ENV UPLOAD_DIR=/data/uploads
USER node

FROM runtime-api AS api
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM runtime-api AS worker
CMD ["node", "--enable-source-maps", "dist/worker.js"]

# ── One-off: apply database migrations (needs the Prisma CLI) ───────────
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["pnpm", "db:migrate"]

# ── Storefront: Next.js standalone server ───────────────────────────────
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
