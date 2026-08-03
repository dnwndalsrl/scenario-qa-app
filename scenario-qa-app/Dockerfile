# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS builder

WORKDIR /build
ENV CI=true NUXT_TELEMETRY_DISABLED=1

COPY scenario-test-runner/package.json scenario-test-runner/package-lock.json ./scenario-test-runner/
RUN --mount=type=cache,target=/root/.npm npm ci --prefix scenario-test-runner
COPY scenario-test-runner ./scenario-test-runner

COPY scenario-qa-app/package.json scenario-qa-app/package-lock.json ./scenario-qa-app/
RUN --mount=type=cache,target=/root/.npm npm ci --prefix scenario-qa-app
COPY scenario-qa-app ./scenario-qa-app
RUN npm --prefix scenario-qa-app run build

FROM node:22-bookworm-slim AS runtime

ARG APP_VERSION=development
ARG GIT_COMMIT_SHA=unknown
ARG BUILD_TIMESTAMP=unknown

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    HOME=/home/qaapp \
    NUXT_STORAGE_ROOT=/app/storage \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT_SHA=${GIT_COMMIT_SHA} \
    BUILD_TIMESTAMP=${BUILD_TIMESTAMP}

LABEL org.opencontainers.image.title="scenario-qa-app" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIMESTAMP}"

WORKDIR /app
COPY --from=builder /build/scenario-qa-app/.output ./.output

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && node .output/server/node_modules/playwright/cli.js install --with-deps chromium \
    && groupadd --gid 10001 qaapp \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin qaapp \
    && mkdir -p /app/storage/artifacts /ms-playwright \
    && chown -R qaapp:qaapp /app /ms-playwright /home/qaapp \
    && rm -rf /var/lib/apt/lists/* /root/.cache

USER 10001:10001
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", ".output/server/index.mjs"]
