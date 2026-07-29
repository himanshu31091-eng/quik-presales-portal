#!/usr/bin/env node
/**
 * QuikIT production smoke-test harness.
 *
 * Zero external deps — uses built-in fetch + performance.now().
 *
 * Usage:
 *   BASE_URL=http://localhost:3004 \
 *   AUTH_COOKIE="next-auth.session-token=..." \
 *   APP=quikscale \
 *   node scripts/smoke-test.mjs
 *
 * Environment:
 *   BASE_URL      — base URL of the app under test (required)
 *   AUTH_COOKIE   — session cookie string (optional — public endpoints only if absent)
 *   APP           — one of "quikscale" | "quikit" | "admin" (default: quikscale)
 *   REQS          — number of requests per endpoint (default: 30)
 *   CONCURRENCY   — concurrent requests (default: 4)
 *   OUTPUT_DIR    — where to write the report (default: docs/audit)
 *   PUBLIC_ONLY   — if "1", skip endpoints that need auth
 *
 * The harness only hits GET endpoints. It never mutates data.
 */

import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL || "http://localhost:3004";
const AUTH_COOKIE = process.env.AUTH_COOKIE || "";
const APP = process.env.APP || "quikscale";
const REQS = parseInt(process.env.REQS || "30", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "4", 10);
const PUBLIC_ONLY = process.env.PUBLIC_ONLY === "1";
const OUTPUT_DIR = process.env.OUTPUT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "audit");

// ─── Endpoint catalogs (GET only, no mutations, no cron) ─────────────────────

const QUIKSCALE_ENDPOINTS = [
  // Public
  { module: "health",      path: "/api/health",                  auth: "public" },
  { module: "health",      path: "/api/health/ready",            auth: "public" },
  { module: "auth",        path: "/api/auth/session",            auth: "public" },
  { module: "auth",        path: "/api/auth/providers",          auth: "public" },
  { module: "auth",        path: "/api/auth/csrf",               auth: "public" },

  // Tenant-scoped reads
  { module: "apps",        path: "/api/apps",                    auth: "tenant" },
  { module: "apps",        path: "/api/apps/switcher",           auth: "tenant" },
  { module: "feature-flags", path: "/api/feature-flags/me",      auth: "tenant" },
  { module: "org",         path: "/api/org/memberships",         auth: "tenant" },
  { module: "org",         path: "/api/org/teams",               auth: "tenant" },
  { module: "org",         path: "/api/org/quarters",            auth: "tenant" },
  { module: "org",         path: "/api/org/users",               auth: "tenant" },
  { module: "users",       path: "/api/users",                   auth: "tenant" },
  { module: "teams",       path: "/api/teams",                   auth: "tenant" },
  { module: "kpi",         path: "/api/kpi",                     auth: "tenant" },
  { module: "kpi",         path: "/api/kpi/years",               auth: "tenant" },
  { module: "priority",    path: "/api/priority",                auth: "tenant" },
  { module: "www",         path: "/api/www",                     auth: "tenant" },
  { module: "categories",  path: "/api/categories",              auth: "tenant" },
  { module: "opsp",        path: "/api/opsp",                    auth: "tenant" },
  { module: "opsp",        path: "/api/opsp/config",             auth: "tenant" },
  { module: "opsp",        path: "/api/opsp/deadline",           auth: "tenant" },
  { module: "opsp",        path: "/api/opsp/history",            auth: "tenant" },
  { module: "meetings",    path: "/api/meetings",                auth: "tenant" },
  { module: "meetings",    path: "/api/meetings/templates",      auth: "tenant" },
  { module: "daily-huddle", path: "/api/daily-huddle",           auth: "tenant" },
  { module: "performance", path: "/api/performance/cycle",       auth: "tenant" },
  { module: "performance", path: "/api/performance/individual",  auth: "tenant" },
  { module: "performance", path: "/api/performance/scorecard",   auth: "tenant" },
  { module: "performance", path: "/api/performance/teams",       auth: "tenant" },
  { module: "performance", path: "/api/performance/trends",      auth: "tenant" },
  { module: "performance", path: "/api/performance/goals",       auth: "tenant" },
  { module: "performance", path: "/api/performance/reviews",     auth: "tenant" },
  { module: "performance", path: "/api/performance/one-on-one",  auth: "tenant" },
  { module: "performance", path: "/api/performance/feedback",    auth: "tenant" },
  { module: "performance", path: "/api/performance/talent",      auth: "tenant" },
  { module: "settings",    path: "/api/settings/company",        auth: "tenant" },
  { module: "settings",    path: "/api/settings/profile",        auth: "tenant" },
  { module: "settings",    path: "/api/settings/configurations", auth: "tenant" },
  { module: "settings",    path: "/api/settings/table-preferences", auth: "tenant" },
  { module: "session",     path: "/api/session/validate",        auth: "tenant" },
];

const QUIKIT_ENDPOINTS = [
  { module: "auth",        path: "/api/auth/session",            auth: "public" },
  { module: "auth",        path: "/api/auth/providers",          auth: "public" },
  { module: "auth",        path: "/api/auth/csrf",               auth: "public" },
  { module: "oauth",       path: "/api/oauth/jwks",              auth: "public" },
  { module: "oauth",       path: "/api/oauth/diag",              auth: "public" },
  { module: "apps",        path: "/api/apps/launcher",           auth: "tenant" },
  { module: "org",         path: "/api/org/memberships",         auth: "tenant" },
  { module: "broadcasts",  path: "/api/broadcasts/active",       auth: "tenant" },
  // Super-admin reads
  { module: "super/orgs",  path: "/api/super/orgs",              auth: "super-admin" },
  { module: "super/users", path: "/api/super/users",             auth: "super-admin" },
  { module: "super/apps",  path: "/api/super/apps",              auth: "super-admin" },
  { module: "super/plans", path: "/api/super/plans",             auth: "super-admin" },
  { module: "super/broadcasts", path: "/api/super/broadcasts",   auth: "super-admin" },
  { module: "super/alerts", path: "/api/super/alerts",           auth: "super-admin" },
  { module: "super/audit", path: "/api/super/audit",             auth: "super-admin" },
  { module: "super/analytics", path: "/api/super/analytics/overview", auth: "super-admin" },
  { module: "super/cron",  path: "/api/super/cron/last-run",     auth: "super-admin" },
];

const ADMIN_ENDPOINTS = [
  { module: "auth",        path: "/api/auth/session",            auth: "public" },
  { module: "auth",        path: "/api/auth/providers",          auth: "public" },
  { module: "feature-flags", path: "/api/feature-flags/me",      auth: "tenant" },
  { module: "org",         path: "/api/org/memberships",         auth: "tenant" },
  { module: "session",     path: "/api/session/validate",        auth: "tenant" },
  { module: "dashboard",   path: "/api/dashboard/stats",         auth: "admin" },
  { module: "apps",        path: "/api/apps",                    auth: "admin" },
  { module: "apps",        path: "/api/apps/switcher",           auth: "tenant" },
  { module: "apps",        path: "/api/apps/access",             auth: "admin" },
  { module: "members",     path: "/api/members",                 auth: "admin" },
  { module: "roles",       path: "/api/roles",                   auth: "admin" },
  { module: "teams",       path: "/api/teams",                   auth: "admin" },
  { module: "settings",    path: "/api/settings",                auth: "admin" },
];

const CATALOGS = {
  quikscale: QUIKSCALE_ENDPOINTS,
  quikit: QUIKIT_ENDPOINTS,
  admin: ADMIN_ENDPOINTS,
};

// ─── Stats helpers ───────────────────────────────────────────────────────────

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function fmtMs(ms) {
  if (ms < 10) return `${ms.toFixed(1)}ms`;
  return `${Math.round(ms)}ms`;
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runOne(url, headers) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers, redirect: "manual" });
    // Drain body so Node timers are accurate
    await res.arrayBuffer().catch(() => null);
    const dt = performance.now() - t0;
    return { ok: res.status < 500, status: res.status, ms: dt };
  } catch (err) {
    const dt = performance.now() - t0;
    return { ok: false, status: 0, ms: dt, error: err?.message || String(err) };
  }
}

async function measureEndpoint(ep, baseUrl, cookie) {
  const url = baseUrl.replace(/\/$/, "") + ep.path;
  const headers = { "User-Agent": "quikit-smoke/1.0" };
  if (cookie) headers.Cookie = cookie;

  const results = [];
  // Simple concurrency via chunks
  for (let i = 0; i < REQS; i += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, REQS - i) }, () => runOne(url, headers));
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const errors = results.filter((r) => !r.ok).length;
  const statuses = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return {
    endpoint: ep,
    count: results.length,
    errors,
    statuses,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    avg: times.reduce((a, b) => a + b, 0) / (times.length || 1),
    min: times[0] || 0,
    max: times[times.length - 1] || 0,
  };
}

// ─── Report builder ──────────────────────────────────────────────────────────

function buildReport({ app, baseUrl, authMode, results, startedAt, finishedAt }) {
  const lines = [];
  lines.push(`# Smoke Test Report — ${app}`);
  lines.push("");
  lines.push(`- Base URL: \`${baseUrl}\``);
  lines.push(`- Auth mode: **${authMode}**`);
  lines.push(`- Started: ${startedAt}`);
  lines.push(`- Finished: ${finishedAt}`);
  lines.push(`- Requests per endpoint: ${REQS} (concurrency ${CONCURRENCY})`);
  lines.push("");

  const totalEndpoints = results.length;
  const totalRequests = results.reduce((a, r) => a + r.count, 0);
  const totalErrors = results.reduce((a, r) => a + r.errors, 0);
  const allTimes = results.flatMap((r) => Array(r.count).fill(r.avg)); // approx (avg-weighted)
  const overallP50 = percentile([...results.map((r) => r.p50)].sort((a, b) => a - b), 50);
  const overallP95 = percentile([...results.map((r) => r.p95)].sort((a, b) => a - b), 95);
  const overallP99 = percentile([...results.map((r) => r.p99)].sort((a, b) => a - b), 99);

  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Endpoints hit | ${totalEndpoints} |`);
  lines.push(`| Total requests | ${totalRequests} |`);
  lines.push(`| Total errors (5xx or fetch-fail) | ${totalErrors} |`);
  lines.push(`| Error rate | ${((totalErrors / Math.max(1, totalRequests)) * 100).toFixed(2)}% |`);
  lines.push(`| Overall p50 (of per-endpoint p50s) | ${fmtMs(overallP50)} |`);
  lines.push(`| Overall p95 (of per-endpoint p95s) | ${fmtMs(overallP95)} |`);
  lines.push(`| Overall p99 (of per-endpoint p99s) | ${fmtMs(overallP99)} |`);
  lines.push("");

  // Group by module
  const byModule = new Map();
  for (const r of results) {
    const m = r.endpoint.module;
    if (!byModule.has(m)) byModule.set(m, []);
    byModule.get(m).push(r);
  }

  for (const [module, rows] of [...byModule.entries()].sort()) {
    lines.push(`## ${app} — ${module} module`);
    lines.push("");
    lines.push(`| Endpoint | Auth | Requests | Errors | Status codes | p50 | p95 | p99 | avg |`);
    lines.push(`|---|---|---|---|---|---|---|---|---|`);
    for (const r of rows) {
      const statuses = Object.entries(r.statuses)
        .map(([s, n]) => `${s}×${n}`)
        .join(" ");
      lines.push(
        `| GET \`${r.endpoint.path}\` | ${r.endpoint.auth} | ${r.count} | ${r.errors} | ${statuses} | ${fmtMs(r.p50)} | ${fmtMs(r.p95)} | ${fmtMs(r.p99)} | ${fmtMs(r.avg)} |`
      );
    }
    lines.push("");
  }

  // Slow endpoints
  const slow = results.filter((r) => r.p95 > 500).sort((a, b) => b.p95 - a.p95);
  if (slow.length > 0) {
    lines.push(`## Slow endpoints (p95 > 500ms)`);
    lines.push("");
    lines.push(`| Endpoint | p95 | p99 | avg |`);
    lines.push(`|---|---|---|---|`);
    for (const r of slow) {
      lines.push(`| GET \`${r.endpoint.path}\` | ${fmtMs(r.p95)} | ${fmtMs(r.p99)} | ${fmtMs(r.avg)} |`);
    }
    lines.push("");
  }

  // Errored endpoints
  const errored = results.filter((r) => r.errors > 0);
  if (errored.length > 0) {
    lines.push(`## Endpoints with errors`);
    lines.push("");
    lines.push(`| Endpoint | Errors | Status codes |`);
    lines.push(`|---|---|---|`);
    for (const r of errored) {
      const statuses = Object.entries(r.statuses)
        .map(([s, n]) => `${s}×${n}`)
        .join(" ");
      lines.push(`| GET \`${r.endpoint.path}\` | ${r.errors} | ${statuses} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const catalog = CATALOGS[APP];
  if (!catalog) {
    console.error(`Unknown APP "${APP}". Expected: quikscale | quikit | admin.`);
    process.exit(2);
  }

  const authMode = AUTH_COOKIE ? "authenticated" : "public-only";
  const endpoints = PUBLIC_ONLY || !AUTH_COOKIE
    ? catalog.filter((e) => e.auth === "public")
    : catalog;

  if (endpoints.length === 0) {
    console.error("No endpoints to test.");
    process.exit(2);
  }

  console.log(`[smoke] APP=${APP} BASE_URL=${BASE_URL} auth=${authMode} endpoints=${endpoints.length} reqs/ep=${REQS}`);
  const startedAt = new Date().toISOString();

  const results = [];
  for (const ep of endpoints) {
    process.stdout.write(`  GET ${ep.path} ... `);
    const r = await measureEndpoint(ep, BASE_URL, AUTH_COOKIE);
    results.push(r);
    const tag = r.errors === 0 ? "OK" : `${r.errors} err`;
    console.log(`${tag}  p50=${fmtMs(r.p50)}  p95=${fmtMs(r.p95)}  p99=${fmtMs(r.p99)}`);
  }

  const finishedAt = new Date().toISOString();
  const report = buildReport({ app: APP, baseUrl: BASE_URL, authMode, results, startedAt, finishedAt });

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const ts = startedAt.replace(/[:.]/g, "-");
  const outPath = resolve(OUTPUT_DIR, `SMOKE_TEST_REPORT_${APP}_${ts}.md`);
  writeFileSync(outPath, report, "utf8");

  console.log("");
  console.log(`[smoke] report written to ${outPath}`);

  const totalErrors = results.reduce((a, r) => a + r.errors, 0);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(1);
});
