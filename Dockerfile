# Stage 1: deps — install dependencies
FROM oven/bun:1.2.19 AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Stage 2: build — build the application
FROM deps AS build
COPY . .
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server
ENV DATABASE_URL=postgres://dummy:dummy@dummy:5432/dummy
RUN bun run build

# Stage 3: runtime — minimal runtime image
FROM oven/bun:1.2.19-slim AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["bun", ".output/server/index.mjs"]
