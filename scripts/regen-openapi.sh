#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# regen-openapi.sh — regenerate the combined Platform OpenAPI 3.0 spec.
#
# Walks all 5 apps' app/api/**/route.ts files and emits a single
# apps/quikit/lib/openapi.yaml. The QuikIT launcher serves it (auth-gated)
# at GET /api/docs, with Swagger UI rendering it. Sister apps redirect
# /api/docs to that central URL with a tag pre-filter.
#
# Run this whenever a route is added/removed/renamed across any app.
# Usage:
#   ./scripts/regen-openapi.sh
#
# Output: apps/quikit/lib/openapi.yaml (overwritten in place)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GEN="$REPO_ROOT/_internal/api-contract-tools/build_openapi_spec.py"
OUT="$REPO_ROOT/apps/quikit/lib/openapi.yaml"

if [ ! -f "$GEN" ]; then
  echo "✗ Generator not found: $GEN"
  echo "  This script depends on the gitignored _internal/ tooling. Restore it from git history if needed."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ python3 not on PATH. Install Python 3.10+."
  exit 1
fi

echo "▸ Generating OpenAPI spec from all 5 apps..."
python3 "$GEN" > "$OUT"

# Quick stats
LINES=$(wc -l < "$OUT" | tr -d ' ')
PATHS=$(grep -c '^  "/api/' "$OUT" || echo 0)
TAGS=$(grep -c '^  - name:' "$OUT" || echo 0)
SIZE=$(ls -lh "$OUT" | awk '{print $5}')

echo ""
echo "✓ Spec written: $OUT"
echo "  $LINES lines · $PATHS path entries · $TAGS tags · $SIZE"
echo ""
echo "Next: hard-refresh http://localhost:3000/api/docs to see the new routes."
