#!/usr/bin/env node
/**
 * scripts/check-prod-urls.mjs — prod-safety gate for URL fallbacks.
 *
 * Scans runtime source code for references to localhost / 127.0.0.1 and
 * fails the build if any are found outside the allowlist.
 *
 * Philosophy: "no localhost as a silent default in prod code paths."
 * Tests, env-file examples, playwright config, docs, CI workflows, and
 * dev-only scripts are legitimate places for localhost and are allowlisted.
 *
 * Usage:
 *   node scripts/check-prod-urls.mjs           # exit 1 on violation
 *   node scripts/check-prod-urls.mjs --list    # print violations, exit 0
 *
 * Called from:
 *   - .github/workflows/prod-safety.yml (CI gate on pushes / PRs to main)
 *   - .husky/pre-push                   (optional local pre-push check)
 *
 * See docs/engineering/prod-safety-rules.md for the full policy.
 *
 * Exit codes:
 *   0 — no violations
 *   1 — violations found (CI should fail)
 *   2 — script error
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODE = process.argv.includes("--list") ? "list" : "fail";

/* ─── Patterns we're hunting for in code ─────────────────────────────── */
const PATTERN = /http:\/\/localhost|https:\/\/localhost|127\.0\.0\.1|localhost:\d+/;

/* ─── Files/dirs to skip entirely ────────────────────────────────────── */
// Directory basenames that we never descend into.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".vercel",
  "dist",
  "coverage",
  ".git",
]);

// Exact relative paths to skip.
const SKIP_FILES = new Set([
  "scripts/check-prod-urls.mjs",
  "scripts/check-prod-urls.sh",
  "scripts/load-test.mjs",
  "scripts/smoke-test.mjs",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

// Regex tested against the relative path; if it matches, the file is skipped.
const SKIP_PATTERNS = [
  // test trees
  /__tests__\//,
  /\.test\.(ts|tsx|js|jsx|mjs)$/,
  /\.spec\.(ts|tsx|js|jsx|mjs)$/,
  // all env variants (.env, .env.local, .env.example, .env.local.example, etc.)
  /(^|\/)\.env(\..*)?$/,
  // playwright config
  /playwright\.config\.[a-z]+$/,
  // docs
  /\.md$/,
  // prisma schema comments contain localhost examples
  /prisma\/schema\.prisma$/,
  // CI workflows
  /^\.github\/workflows\//,
  // Claude Code local settings (developer-only command allowlists)
  /(^|\/)\.claude\//,
  // Dev-only seed / migration / QA scripts (all run locally with a DATABASE_URL
  // fallback to localhost). These are never bundled into a production runtime.
  /^scripts\/seed-/,
  /^scripts\/qa-test-/,
  /^scripts\/migrate-legacy\//,
  // Docker compose files are dev orchestration only, not runtime code.
  /(^|\/)docker-compose\.ya?ml$/,
  // Dev-only shell scripts (onboarding, regen tooling). Never bundled.
  /^scripts\/onboard-/,
  /^scripts\/regen-/,
];

/* ─── Line-level allow rules — applied AFTER we've found a match ─────── */
// If a matched line matches one of these regexes, it's considered a false
// positive (e.g., a JSDoc @example or a commented-out reference).
const LINE_ALLOW = [
  /^\s*\*/,                        // JSDoc / block-comment continuation lines
  /^\s*\/\*/,                       // JSDoc / block-comment opener lines (/** …)
  /^\s*\/\//,                       // line comments
  /^\s*#/,                         // shell-style comments
  /allowedOrigins:\s*\[/,           // next.config.js server actions list
  // Escape-hatch comment. Use sparingly on a line you have explicitly
  // guarded elsewhere (e.g., a dev-only branch inside a NODE_ENV check).
  // Example:  return "http://localhost:3000"; // prod-safety-allow: dev-only
  /\bprod-safety-allow\b/,
];

/* ─── File extensions we check (keep it tight; binary files excluded) ── */
const CHECK_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".prisma", ".yml", ".yaml",
  ".sh", ".env",
]);

/* ─── Walk the tree ──────────────────────────────────────────────────── */

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function shouldScan(relPath) {
  if (SKIP_FILES.has(relPath)) return false;
  for (const p of SKIP_PATTERNS) if (p.test(relPath)) return false;

  // Only scan files whose extension is in our set (defensive against scanning
  // binaries or images). Treat dotfiles without extension as skip.
  const dot = relPath.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = relPath.slice(dot);
  if (!CHECK_EXTS.has(ext)) return false;

  return true;
}

function scan(files) {
  const violations = [];
  for (const file of files) {
    const rel = relative(REPO_ROOT, file).split(sep).join("/");
    if (!shouldScan(rel)) continue;

    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!PATTERN.test(content)) continue;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!PATTERN.test(line)) continue;
      if (LINE_ALLOW.some((re) => re.test(line))) continue;
      violations.push({ file: rel, lineNo: i + 1, line: line.trim() });
    }
  }
  return violations;
}

/* ─── Main ───────────────────────────────────────────────────────────── */

const files = await walk(REPO_ROOT);
const violations = scan(files);

if (violations.length === 0) {
  console.log("✅ No localhost references found in prod code paths.");
  process.exit(0);
}

console.error("");
console.error("❌ Prod-safety gate: localhost references found in source code.");
console.error("");
console.error("   Every match below is a potential production bug: a URL that");
console.error("   would resolve to localhost if the expected env var is unset.");
console.error("");
console.error("   To fix:");
console.error("     - Env-driven URLs: throw in prod if the env var is missing,");
console.error("       allow a localhost fallback only when NODE_ENV !== 'production'.");
console.error("     - Hard-coded URLs: move to an env var.");
console.error("     - Legitimate test / example usage: confirm the file is covered");
console.error("       by SKIP_PATTERNS / SKIP_FILES in scripts/check-prod-urls.mjs.");
console.error("");
console.error("   See docs/engineering/prod-safety-rules.md for the full policy.");
console.error("");
console.error(`   ${violations.length} match${violations.length === 1 ? "" : "es"}:`);
console.error("");
for (const v of violations) {
  console.error(`   ${v.file}:${v.lineNo}: ${v.line}`);
}
console.error("");

process.exit(MODE === "list" ? 0 : 1);
