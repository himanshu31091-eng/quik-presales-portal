# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `@quikit/realtime-gateway` Node service.
# Pattern (mirrors apps/*): turbo prune --docker (slices monorepo to just this
# service's deps) → installer (npm ci + prisma generate + esbuild bundle) →
# runner (compiled dist + node_modules, non-root). NO tsx at runtime.
#
# Build (from monorepo root):
#   docker build -f services/realtime/Dockerfile -t realtime-gateway:latest .

FROM node:20-alpine AS base

# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune the monorepo down to this service + workspace deps.
# The prune target matches the "name" in services/realtime/package.json.
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @quikit/realtime-gateway --docker

# ─────────────────────────────────────────────────────────────────────────
# Stage 2 — installer: install pruned deps, generate Prisma, bundle to dist.
# --ignore-scripts skips packages/database's postinstall; we run prisma
# generate explicitly with the right schema path.
# ─────────────────────────────────────────────────────────────────────────
FROM base AS installer
# Prisma's query engine needs OpenSSL (libssl) on Alpine. NOTE:
# packages/database/prisma/schema.prisma must list a linux-musl-openssl
# binaryTarget for the engine to load on Alpine at runtime.
RUN apk update && apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci --ignore-scripts

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.base.json tsconfig.base.json

# Placeholder — prisma generate parses the datasource url but never connects.
ARG DATABASE_URL="postgresql://x:x@localhost:5432/x"
ENV DATABASE_URL=$DATABASE_URL
ENV NODE_ENV=production

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npx turbo build --filter=@quikit/realtime-gateway

# ─────────────────────────────────────────────────────────────────────────
# Stage 3 — runner: minimal image running the bundled JS as non-root.
# ─────────────────────────────────────────────────────────────────────────
FROM base AS runner
RUN apk add --no-cache openssl wget
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 gateway

ENV NODE_ENV=production
ENV PORT=9100

# node_modules carries the externalized runtime deps (socket.io, ioredis, pino,
# prom-client, jsonwebtoken) + the generated Prisma client (@prisma / .prisma).
COPY --from=installer --chown=gateway:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=gateway:nodejs /app/services/realtime/dist ./services/realtime/dist

USER gateway
WORKDIR /app/services/realtime
EXPOSE 9100
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-9100}/health" || exit 1
CMD ["node", "dist/index.js"]
