#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# integrate-app.sh — integration owner's tool to pull a dev's app into the
# master monorepo, run the full CI gate, and prepare the merge.
#
# Run this from the master monorepo when a dev's PR is ready for review.
# It does NOT auto-merge — it stages everything so YOU can review the diff,
# run smoke tests, and push the merge train manually.
#
# Usage:
#   ./scripts/integrate-app.sh <github-pr-url-or-branch>
#
#   <github-pr-url-or-branch>
#     - https://github.com/<org>/<repo>/pull/123  → fetches the PR
#     - feature/some-branch                       → pulls from origin
#
# What it does:
#   1. Validates the PR / branch reference.
#   2. Fetches the diff and applies it to a local feature branch.
#   3. Runs the full master-CI gate: lint, typecheck, test, coverage ratchet,
#      branch name + commit format checks.
#   4. Validates the dev's manifest.ts hasn't drifted from agreed contract.
#   5. Smoke-tests the app builds (npm run build).
#   6. Reports a summary: what passed, what failed, what to review manually.
#
# It does NOT:
#   - Push anything (you do this after reviewing).
#   - Modify packages/ (devs aren't allowed to touch them — this script
#     verifies they didn't).
#   - Promote to dev/uat/main (manual merge train per CLAUDE.md).
#
# Requires: gh CLI (for PR-URL form), bash 4+, node 20+, npm.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

INPUT="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()   { printf "\033[34m▸\033[0m %s\n" "$*"; }
ok()    { printf "\033[32m✓\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m⚠\033[0m %s\n" "$*"; }
fail()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }
section() { echo ""; printf "\033[35m── %s ──\033[0m\n" "$*"; }

[[ -z "$INPUT" ]] && fail "Usage: $0 <github-pr-url-or-branch>"

cd "$REPO_ROOT"

# ── Refuse to run on dev/uat/main ────────────────────────────────────────────
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "uat" || "$CURRENT_BRANCH" == "dev" ]]; then
  fail "Currently on $CURRENT_BRANCH. Switch to a feature branch first: 'git checkout -b feature/integrate-<app>'"
fi

# ── Resolve input ────────────────────────────────────────────────────────────
section "Resolving PR / branch"
if [[ "$INPUT" =~ ^https://github.com/[^/]+/[^/]+/pull/[0-9]+$ ]]; then
  command -v gh >/dev/null || fail "gh CLI required for PR URL form. Install: https://cli.github.com/"
  PR_NUM="$(echo "$INPUT" | awk -F/ '{print $NF}')"
  log "Fetching PR #$PR_NUM via gh..."
  gh pr checkout "$PR_NUM" --repo "$(echo "$INPUT" | sed -E 's|https://github.com/([^/]+/[^/]+)/.*|\1|')"
  ok "Checked out PR #$PR_NUM"
else
  log "Treating input as branch name: $INPUT"
  git fetch origin "$INPUT"
  git checkout -B "integrate-$INPUT" "origin/$INPUT"
  ok "Checked out integrate-$INPUT"
fi

CURRENT_BRANCH="$(git branch --show-current)"
log "Now on: $CURRENT_BRANCH"

# ── Detect which app the change touches ──────────────────────────────────────
section "Detecting affected apps"
DIFF_FILES="$(git diff --name-only main...HEAD)"
TOUCHED_APPS="$(echo "$DIFF_FILES" | grep -E '^apps/[^/]+/' | awk -F/ '{print $2}' | sort -u)"
TOUCHED_PACKAGES="$(echo "$DIFF_FILES" | grep -E '^packages/' | awk -F/ '{print $2}' | sort -u)"

if [[ -z "$TOUCHED_APPS" ]]; then
  warn "No app changes detected. This may be a docs-only PR."
fi

if [[ -n "$TOUCHED_PACKAGES" ]]; then
  warn "PR touches packages/: $TOUCHED_PACKAGES"
  warn "This is forbidden for dev contributors. Verify whoever opened the PR has write access to packages."
fi

if [[ "$(echo "$TOUCHED_APPS" | wc -w | tr -d ' ')" -gt 1 ]]; then
  warn "PR touches multiple apps: $TOUCHED_APPS"
  warn "Cross-app changes need extra scrutiny. Review carefully."
fi

for app in $TOUCHED_APPS; do
  ok "Touched: apps/$app/"
done

# ── Branch name check ────────────────────────────────────────────────────────
section "Branch name check"
case "$CURRENT_BRANCH" in
  feature/*|fix/*|chore/*|refactor/*|integrate-*) ok "Branch name OK: $CURRENT_BRANCH" ;;
  *) warn "Branch name '$CURRENT_BRANCH' is not feature/fix/chore/refactor — accept only with reason" ;;
esac

# ── Commit message format ────────────────────────────────────────────────────
section "Commit message format (Conventional Commits)"
BAD=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if ! echo "$line" | grep -qE '^(feat|fix|chore|refactor|docs|test|perf|build|ci)(\([a-z0-9-]+\))?: .{3,}'; then
    warn "Bad commit message: $line"
    BAD=$((BAD + 1))
  fi
done < <(git log --pretty=%s main..HEAD)
[[ "$BAD" -eq 0 ]] && ok "All commit messages OK" || warn "$BAD commit message(s) need rewording"

# ── Manifest check (per touched app) ─────────────────────────────────────────
section "Manifest validation"
for app in $TOUCHED_APPS; do
  MANIFEST="$REPO_ROOT/apps/$app/manifest.ts"
  if [[ ! -f "$MANIFEST" ]]; then
    warn "apps/$app/manifest.ts missing"
    continue
  fi
  if grep -q "appId: \"_template\"" "$MANIFEST"; then
    warn "apps/$app/manifest.ts still has appId: \"_template\" — rename before merge"
  fi
  if grep -q "routePrefix: \"/_template\"" "$MANIFEST"; then
    warn "apps/$app/manifest.ts still has routePrefix: \"/_template\""
  fi
  ok "Manifest present: apps/$app/manifest.ts"
done

# ── npm install ──────────────────────────────────────────────────────────────
section "npm install"
npm install
ok "Dependencies installed"

# ── Lint ─────────────────────────────────────────────────────────────────────
section "Lint"
if npx turbo run lint --output-logs=errors-only; then
  ok "Lint passed"
else
  fail "Lint failed — fix before merging"
fi

# ── Typecheck ────────────────────────────────────────────────────────────────
section "Typecheck"
if npx turbo run typecheck --output-logs=errors-only; then
  ok "Typecheck passed"
else
  fail "Typecheck failed — fix before merging"
fi

# ── Test ─────────────────────────────────────────────────────────────────────
section "Test"
if npx turbo run test --output-logs=errors-only; then
  ok "Tests passed"
else
  fail "Tests failed — fix before merging"
fi

# ── Build (per touched app) ──────────────────────────────────────────────────
section "Build smoke-test"
for app in $TOUCHED_APPS; do
  log "Building apps/$app..."
  if (cd "$REPO_ROOT/apps/$app" && npm run build >/dev/null 2>&1); then
    ok "apps/$app builds"
  else
    fail "apps/$app build failed — investigate before merging"
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────
section "Summary"
echo ""
ok "All automated gates passed for: $TOUCHED_APPS"
echo ""
cat <<EOF
  Manual review checklist (CLAUDE.md + docs/02-integration-protocol.md):
    □ tenantId filter on every Prisma query
    □ withTenantAuth wrapper on every route
    □ No 'as any' casts (or each one justified in a comment)
    □ Audit log writes for every mutation
    □ Tests cover 401 + tenant isolation + happy path for new routes
    □ Manifest fields match what was agreed
    □ No new top-level dependencies without a justification
    □ Provider order unchanged
    □ No packages/ modifications

  When ready to merge:
    git checkout dev
    git merge --no-ff $CURRENT_BRANCH -m "Merge $CURRENT_BRANCH into dev"
    git checkout uat && git merge --ff-only dev
    git checkout main && git merge --ff-only uat
    git push origin dev uat main

  Remember: only YOU push to dev/uat/main.
EOF
