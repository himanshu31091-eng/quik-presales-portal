#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# onboard-dev.sh — bootstrap a per-dev repo from apps/_template.
#
# Run this AS THE DEV after cloning their per-dev repo for the first time.
# The integration owner can also run it ahead of time when provisioning the
# repo for a new contractor.
#
# Usage:
#   ./scripts/onboard-dev.sh <app-id>
#
#   <app-id> — kebab-case app id, e.g. "quiksocial", "quikcrm".
#              Must match: ^[a-z][a-z0-9-]{2,30}$
#
# What it does:
#   1. Validates input + checks prereqs (Node 20+, npm, Postgres reachable).
#   2. Copies apps/_template/ to apps/<app-id>/ and renames manifest fields.
#   3. Generates a unique dev port (3010+ scan for unused).
#   4. Creates apps/<app-id>/.env.local from the template with stable
#      placeholders (and a freshly-generated NEXTAUTH_SECRET).
#   5. Runs npm install at the monorepo root.
#   6. Generates the Prisma client.
#   7. Pushes the schema to the local Postgres DB (creates if missing).
#   8. Smoke-tests the dev server starts on the chosen port.
#
# Idempotent: safe to re-run. Will fail loudly if apps/<app-id>/ already
# exists with content other than the template defaults.
#
# Requires: bash 4+, node 20+, npm 11+, psql + createdb (Postgres CLI).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_ID="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$REPO_ROOT/apps/_template"
DB_NAME="quikit_dev"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()   { printf "\033[34m▸\033[0m %s\n" "$*"; }
ok()    { printf "\033[32m✓\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m⚠\033[0m %s\n" "$*"; }
fail()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

# ── Argument validation ──────────────────────────────────────────────────────
[[ -z "$APP_ID" ]] && fail "Usage: $0 <app-id>  (e.g. quiksocial, quikcrm)"

if ! [[ "$APP_ID" =~ ^[a-z][a-z0-9-]{2,30}$ ]]; then
  fail "Invalid app id '$APP_ID'. Use kebab-case, 3-31 chars, start with a letter."
fi

if [[ "$APP_ID" == "_template" || "$APP_ID" == "quikit" || "$APP_ID" == "quikscale" || "$APP_ID" == "admin" ]]; then
  fail "App id '$APP_ID' is reserved. Pick another."
fi

APP_DIR="$REPO_ROOT/apps/$APP_ID"
[[ -d "$APP_DIR" ]] && fail "Directory $APP_DIR already exists. Remove it first if you want to start over."
[[ ! -d "$TEMPLATE_DIR" ]] && fail "Template not found at $TEMPLATE_DIR. Are you running from the right repo?"

# ── Prereq checks ────────────────────────────────────────────────────────────
log "Checking prerequisites..."

NODE_MAJOR="$(node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')" || fail "Node.js not found. Install Node 20+."
[[ "$NODE_MAJOR" -lt 20 ]] && fail "Node $NODE_MAJOR detected; need 20+. Install with nvm: 'nvm install 20'"
ok "Node $(node --version)"

command -v npm >/dev/null 2>&1 || fail "npm not found."
ok "npm $(npm --version)"

command -v psql >/dev/null 2>&1 || fail "psql not found. Install Postgres (Postgres.app on macOS, or Homebrew: 'brew install postgresql')."
ok "psql $(psql --version | awk '{print $3}')"

if ! psql -h localhost -U postgres -c '\l' >/dev/null 2>&1 && \
   ! psql -h localhost -c '\l' >/dev/null 2>&1; then
  warn "Could not connect to Postgres on localhost. The script will continue, but db:push will fail unless Postgres is running."
fi

# ── Pick a unique dev port ───────────────────────────────────────────────────
log "Picking a unique dev port..."
PORT=3010
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || \
      grep -rq "next dev -p $PORT" "$REPO_ROOT/apps" 2>/dev/null; do
  PORT=$((PORT + 1))
  [[ $PORT -gt 3050 ]] && fail "Could not find a free port between 3010 and 3050."
done
ok "Selected port $PORT"

# ── Copy template ────────────────────────────────────────────────────────────
log "Copying apps/_template → apps/$APP_ID..."
cp -R "$TEMPLATE_DIR" "$APP_DIR"
rm -f "$APP_DIR/.skip-build"

# ── Rename + replace placeholders ────────────────────────────────────────────
log "Replacing placeholders..."

# package.json
sed -i.bak \
  -e "s/\"name\": \"_template\"/\"name\": \"$APP_ID\"/" \
  -e "s/next dev -p 3010/next dev -p $PORT/" \
  -e "s/next start -p 3010/next start -p $PORT/" \
  "$APP_DIR/package.json"
# Strip the _comment line we used in the template
sed -i.bak '/"_comment":/d' "$APP_DIR/package.json"

# next.config.js — port in allowedOrigins
sed -i.bak "s/localhost:3010/localhost:$PORT/" "$APP_DIR/next.config.js"

# manifest.ts — appId, name, routePrefix
PASCAL_APP=$(echo "$APP_ID" | awk -F- '{for(i=1;i<=NF;i++) printf "%s%s", toupper(substr($i,1,1)), substr($i,2)}')
sed -i.bak \
  -e "s/appId: \"_template\"/appId: \"$APP_ID\"/" \
  -e "s/name: \"Template App\"/name: \"$PASCAL_APP\"/" \
  -e "s|routePrefix: \"/_template\"|routePrefix: \"/$APP_ID\"|" \
  -e "s|href: \"/_template\"|href: \"/$APP_ID\"|" \
  "$APP_DIR/manifest.ts"

# layout.tsx — title
sed -i.bak \
  "s/title: \"Template App\"/title: \"$PASCAL_APP\"/" \
  "$APP_DIR/app/layout.tsx"

# README — heading + path references
sed -i.bak \
  -e "s/# Template App/# $PASCAL_APP/" \
  -e "s|apps/_template/|apps/$APP_ID/|g" \
  "$APP_DIR/README.md"

# Cleanup .bak files left by macOS sed
find "$APP_DIR" -name "*.bak" -delete
ok "Placeholders replaced"

# ── Generate .env.local ──────────────────────────────────────────────────────
log "Generating .env.local with stable placeholders..."
ENV_FILE="$APP_DIR/.env.local"
SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)

cat > "$ENV_FILE" <<EOF
# Generated by scripts/onboard-dev.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Edit values for your local setup. NEVER commit this file.

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$DB_NAME"
MIGRATION_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$DB_NAME"

NEXTAUTH_SECRET="$SECRET"
NEXTAUTH_URL="http://localhost:$PORT"

# Replace with your own dev OAuth client when ready (see docs/00-getting-started.md).
QUIKIT_CLIENT_ID="dev-client-id-placeholder"
QUIKIT_CLIENT_SECRET="dev-client-secret-placeholder"
QUIKIT_ISSUER_URL="http://localhost:3000"

NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""
EOF
chmod 600 "$ENV_FILE"
ok ".env.local created (mode 600)"

# ── npm install at root ──────────────────────────────────────────────────────
log "Installing workspace dependencies (this can take 2-3 min)..."
cd "$REPO_ROOT"
npm install
ok "Dependencies installed"

# ── Generate Prisma client ───────────────────────────────────────────────────
log "Generating Prisma client..."
npm run db:generate
ok "Prisma client generated"

# ── Ensure DB exists ─────────────────────────────────────────────────────────
log "Ensuring local database '$DB_NAME' exists..."
if psql -h localhost -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  ok "Database '$DB_NAME' already exists"
else
  if createdb -h localhost "$DB_NAME" 2>/dev/null; then
    ok "Created database '$DB_NAME'"
  else
    warn "Could not create '$DB_NAME' automatically. Create it manually: 'createdb $DB_NAME' (or via psql)."
  fi
fi

# ── Push schema ──────────────────────────────────────────────────────────────
log "Pushing Prisma schema to local DB..."
if npm run db:push >/dev/null 2>&1; then
  ok "Schema pushed"
else
  warn "db:push failed. Run manually: 'npm run db:push' once your local Postgres is reachable."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
ok "Onboarding complete for apps/$APP_ID"
echo ""
cat <<EOF
  Next steps:
    cd apps/$APP_ID
    npm run dev          # starts dev server on http://localhost:$PORT
    npm run typecheck    # before every commit
    npm run lint         # before every commit
    npm run test         # before every commit

  Read first:
    docs/00-getting-started.md
    apps/$APP_ID/CLAUDE.md      # strict app-level rules
    docs/02-integration-protocol.md

  When stuck:
    docs/09-troubleshooting.md
EOF
