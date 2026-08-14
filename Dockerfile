# syntax=docker/dockerfile:1

# Natura SecOps — production-ready multi-stage Docker image
# Uses Bun for fast install/build and a slim Bun image for runtime.

# ------------------------------------------------------------------------------
# Stage 1: deps
# ------------------------------------------------------------------------------
FROM oven/bun:1.2.19 AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# ------------------------------------------------------------------------------
# Stage 2: build
# ------------------------------------------------------------------------------
FROM deps AS build

COPY . .

ENV NODE_ENV=production
ENV NITRO_PRESET=node-server
# Dummy DATABASE_URL so the build can run server-side queries/static generation
# without a real database. Override at runtime via env var or docker-compose.
ENV DATABASE_URL=postgres://dummy:dummy@dummy:5432/dummy

RUN bun run build

# ------------------------------------------------------------------------------
# Stage 3: runtime
# ------------------------------------------------------------------------------
FROM oven/bun:1.2.19-slim AS runtime
WORKDIR /app

# Run as non-root user for security
RUN groupadd --system --gid 1001 bunjs && \
    useradd --system --uid 1001 --gid bunjs appuser && \
    chown -R appuser:bunjs /app

COPY --from=deps --chown=appuser:bunjs /app/node_modules ./node_modules
COPY --from=build --chown=appuser:bunjs /app/.output ./.output
COPY --from=build --chown=appuser:bunjs /app/package.json ./package.json
COPY --from=build --chown=appuser:bunjs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER appuser

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["./docker-entrypoint.sh"]
