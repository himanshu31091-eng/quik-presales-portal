# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `auth` Next.js app.
# Pattern: turbo prune --docker (slices monorepo to just this app's deps)
#   → installer (npm install --ignore-scripts + prisma generate + next build)
#   → runner (standalone output + Prisma engines, non-root)
#
# Build (from monorepo root):
#   docker build -f apps/auth/Dockerfile -t authatest .
# Build with custom DATABASE_URL (optional — defaults pass build-time Prisma init):
#   docker build --build-arg DATABASE_URL="postgresql://..." -f apps/auth/Dockerfile -t authatest .

FROM node:20-alpine AS base

# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo down to just `auth` + its workspace deps
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune auth --docker

# ─────────────────────────────────────────────────────────────────────────
# Stage 2 — installer: install pruned deps + generate Prisma + build
# --ignore-scripts skips packages/database's postinstall (we run prisma
# generate explicitly below so it picks up the right schema path).
# ─────────────────────────────────────────────────────────────────────────
FROM base AS installer
RUN apk update && apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci --ignore-scripts

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.base.json tsconfig.base.json

# Build-time placeholders — `next build` instantiates Prisma at "Collect
# page data" time. They are never used to connect to a real DB.
ARG DATABASE_URL="postgresql://x:x@localhost:5432/x"
ARG DATABASE_URL_DIRECT="postgresql://x:x@localhost:5432/x"
ARG NEXTAUTH_URL="https://placeholder.com"
ARG NEXT_PUBLIC_LAUNCHER_URL="https://placeholder.com"
ARG NEXT_PUBLIC_AUTH_URL="https://placeholder.com"
ARG NEXT_PUBLIC_QUIKIT_URL="https://placeholder.com"
ARG NEXT_PUBLIC_ADMIN_URL="https://placeholder.com"
ARG NEXT_PUBLIC_LOGIN_URL="https://placeholder.com/login"
ARG NEXT_PUBLIC_SENTRY_DSN

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_LAUNCHER_URL=$NEXT_PUBLIC_LAUNCHER_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_LOGIN_URL=$NEXT_PUBLIC_LOGIN_URL
ENV NEXTAUTH_SECRET="build-time-dummy-not-used-at-runtime"
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Cache-bust: embed ARG values into the RUN command string so BuildKit
# invalidates this layer (and the build that follows) whenever the
# NEXT_PUBLIC_* / NEXTAUTH_URL build-args change. Without this line,
# BuildKit reuses the cached `npx turbo build` layer and the new ARG
# values never reach `next build`.
RUN echo "[next-env-bake]" \
      "LAUNCHER=$NEXT_PUBLIC_LAUNCHER_URL" \
      "AUTH=$NEXT_PUBLIC_AUTH_URL" \
      "QUIKIT=$NEXT_PUBLIC_QUIKIT_URL" \
      "ADMIN=$NEXT_PUBLIC_ADMIN_URL" \
      "LOGIN=$NEXT_PUBLIC_LOGIN_URL" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN mkdir -p apps/auth/public
RUN mkdir -p apps/auth/.next/static
# Write .env.production from ARG/ENV values so Next.js loadEnv()
# picks them up deterministically. Bypasses turbo's env filtering
# (the previous failure mode: shell ENV was set but didn't reach
# Next's process.env during next build, leaving client bundles
# with undefined NEXT_PUBLIC_* values).
RUN printf '%s\n' \
  "NEXT_PUBLIC_LAUNCHER_URL=$NEXT_PUBLIC_LAUNCHER_URL" \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL" \
  "NEXT_PUBLIC_LOGIN_URL=$NEXT_PUBLIC_LOGIN_URL" \
  "NEXTAUTH_URL=$NEXTAUTH_URL" \
  > apps/auth/.env.production && cat apps/auth/.env.production

RUN npx turbo build --filter=auth

# ─────────────────────────────────────────────────────────────────────────
# Stage 3 — runner: minimal image, standalone server + Prisma engines
# ─────────────────────────────────────────────────────────────────────────
FROM base AS runner
RUN apk add --no-cache openssl
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Standalone server (Next 14 monorepo output: apps/auth/server.js)
COPY --from=installer --chown=nextjs:nodejs /app/apps/auth/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/auth/.next/static    ./apps/auth/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/auth/public          ./public
COPY --from=installer --chown=nextjs:nodejs /app/apps/auth/public          ./apps/auth/public

# Prisma client (engine + generated bindings); standalone doesn't always trace these
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma  ./node_modules/.prisma

USER nextjs
EXPOSE 3001

CMD ["node", "apps/auth/server.js"]
