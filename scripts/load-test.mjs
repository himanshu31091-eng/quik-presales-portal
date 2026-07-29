#!/usr/bin/env node

/**
 * QuikIT Platform — API Load Testing Script
 *
 * Usage:
 *   node scripts/load-test.mjs --app quikscale      # Test QuikScale APIs (port 3004)
 *   node scripts/load-test.mjs --app admin           # Test Admin APIs (port 3005)
 *   node scripts/load-test.mjs --app quikit          # Test QuikIT APIs (port 3006)
 *   node scripts/load-test.mjs --app all             # Test all apps
 *   node scripts/load-test.mjs --app quikscale --duration 30  # 30 second tests
 *
 * Prerequisites:
 *   - Apps must be running locally (npm run dev)
 *   - Valid session cookie for authenticated endpoints
 *
 * Scale target: 50,000 concurrent users
 *   - 10 connections  = light load
 *   - 50 connections  = moderate load (single server)
 *   - 200 connections = heavy load (simulating 50K with connection reuse)
 */

import autocannon from "autocannon";

// ─── Configuration ─────────────────────────────────────────────────────────

const PORTS = { quikscale: 3004, admin: 3005, quikit: 3006 };

const args = process.argv.slice(2);
const appArg = args.find((a, i) => args[i - 1] === "--app") || "quikscale";
const duration = parseInt(args.find((a, i) => args[i - 1] === "--duration") || "10");
const connections = parseInt(args.find((a, i) => args[i - 1] === "--connections") || "50");

// ─── Test Definitions ──────────────────────────────────────────────────────

const TESTS = {
  quikscale: [
    // Unauthenticated endpoints
    { name: "Health Check", method: "GET", path: "/api/health", expectStatus: 200, auth: false },
    { name: "Health Ready", method: "GET", path: "/api/health/ready", expectStatus: 200, auth: false },

    // Authenticated endpoints (will get 401 without cookie — measures auth overhead)
    { name: "KPI List (no auth)", method: "GET", path: "/api/kpi", expectStatus: 401, auth: false },
    { name: "Priority List (no auth)", method: "GET", path: "/api/priority", expectStatus: 401, auth: false },
    { name: "WWW List (no auth)", method: "GET", path: "/api/www", expectStatus: 401, auth: false },
    { name: "Meetings List (no auth)", method: "GET", path: "/api/meetings", expectStatus: 401, auth: false },
    { name: "Org Teams (no auth)", method: "GET", path: "/api/org/teams", expectStatus: 401, auth: false },
    { name: "Org Users (no auth)", method: "GET", path: "/api/org/users", expectStatus: 401, auth: false },
    { name: "Settings Company (no auth)", method: "GET", path: "/api/settings/company", expectStatus: 401, auth: false },
    { name: "Daily Huddle (no auth)", method: "GET", path: "/api/daily-huddle", expectStatus: 401, auth: false },
    { name: "Session Validate (no auth)", method: "GET", path: "/api/session/validate", expectStatus: 401, auth: false },

    // POST endpoints — measure validation + auth overhead
    { name: "KPI Create (no auth)", method: "POST", path: "/api/kpi", body: "{}", expectStatus: 401, auth: false },
    { name: "Org Users Create (no auth)", method: "POST", path: "/api/org/users", body: "{}", expectStatus: 401, auth: false },
  ],

  admin: [
    { name: "Members List (no auth)", method: "GET", path: "/api/members", expectStatus: 401, auth: false },
    { name: "Teams List (no auth)", method: "GET", path: "/api/teams", expectStatus: 401, auth: false },
    { name: "Dashboard Stats (no auth)", method: "GET", path: "/api/dashboard/stats", expectStatus: 401, auth: false },
    { name: "Settings (no auth)", method: "GET", path: "/api/settings", expectStatus: 401, auth: false },
    { name: "Apps List (no auth)", method: "GET", path: "/api/apps", expectStatus: 401, auth: false },
    { name: "Roles (no auth)", method: "GET", path: "/api/roles", expectStatus: 401, auth: false },
    { name: "Session Validate (no auth)", method: "GET", path: "/api/session/validate", expectStatus: 401, auth: false },
    { name: "Members Create (no auth)", method: "POST", path: "/api/members", body: "{}", expectStatus: 401, auth: false },
  ],

  quikit: [
    { name: "Super Orgs (no auth)", method: "GET", path: "/api/super/orgs", expectStatus: 401, auth: false },
    { name: "Super Users (no auth)", method: "GET", path: "/api/super/users", expectStatus: 401, auth: false },
    { name: "Super Apps (no auth)", method: "GET", path: "/api/super/apps", expectStatus: 401, auth: false },
    { name: "Super Audit (no auth)", method: "GET", path: "/api/super/audit", expectStatus: 401, auth: false },
    { name: "OAuth JWKS", method: "GET", path: "/api/oauth/jwks", expectStatus: 200, auth: false },
    { name: "App Launcher (no auth)", method: "GET", path: "/api/apps/launcher", expectStatus: 401, auth: false },
    { name: "Bulk Orgs (no auth)", method: "POST", path: "/api/super/orgs/bulk", body: JSON.stringify({ action: "suspend", ids: ["x"] }), expectStatus: 401, auth: false },
  ],
};

// ─── Runner ────────────────────────────────────────────────────────────────

function formatNumber(n) {
  return n.toLocaleString("en-US");
}

function formatLatency(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function runTest(app, test) {
  const port = PORTS[app];
  const url = `http://localhost:${port}${test.path}`;

  const opts = {
    url,
    connections,
    duration,
    method: test.method,
    headers: { "content-type": "application/json" },
  };

  if (test.body) {
    opts.body = test.body;
  }

  try {
    const result = await autocannon(opts);
    return {
      name: test.name,
      app,
      url: test.path,
      method: test.method,
      requests: result.requests.total,
      rps: Math.round(result.requests.average),
      latencyAvg: result.latency.average,
      latencyP50: result.latency.p50,
      latencyP99: result.latency.p99,
      latencyMax: result.latency.max,
      throughput: result.throughput.average,
      errors: result.errors,
      timeouts: result.timeouts,
      status2xx: result["2xx"],
      status4xx: result["4xx"],
      status5xx: result["5xx"],
      nonZeroStatus: result.non2xx - result["4xx"] - result["5xx"],
      pass: true,
    };
  } catch (err) {
    return {
      name: test.name,
      app,
      url: test.path,
      method: test.method,
      error: err.message,
      pass: false,
    };
  }
}

async function runAppTests(app) {
  const tests = TESTS[app];
  if (!tests) {
    console.error(`Unknown app: ${app}`);
    return [];
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  LOAD TEST: ${app.toUpperCase()} (port ${PORTS[app]})`);
  console.log(`  Duration: ${duration}s | Connections: ${connections}`);
  console.log(`${"=".repeat(70)}\n`);

  // Check if server is running
  try {
    await fetch(`http://localhost:${PORTS[app]}/`, { signal: AbortSignal.timeout(2000) });
  } catch {
    console.log(`  [SKIP] ${app} is not running on port ${PORTS[app]}\n`);
    return [];
  }

  const results = [];
  for (const test of tests) {
    process.stdout.write(`  Testing: ${test.name.padEnd(35)}`);
    const result = await runTest(app, test);
    results.push(result);

    if (result.pass) {
      console.log(
        `${formatNumber(result.rps).padStart(6)} req/s | ` +
        `avg ${formatLatency(result.latencyAvg).padStart(7)} | ` +
        `p99 ${formatLatency(result.latencyP99).padStart(7)} | ` +
        `err ${result.errors}`
      );
    } else {
      console.log(`  FAILED: ${result.error}`);
    }
  }

  return results;
}

// ─── Report ────────────────────────────────────────────────────────────────

function generateReport(allResults) {
  console.log(`\n${"=".repeat(70)}`);
  console.log("  LOAD TEST SUMMARY REPORT");
  console.log(`${"=".repeat(70)}\n`);

  const passed = allResults.filter((r) => r.pass);
  const failed = allResults.filter((r) => !r.pass);

  // Performance thresholds for 50K users
  const THRESHOLDS = {
    rps_min: 500,           // Minimum acceptable RPS per endpoint
    latency_p99_max: 500,   // Max p99 latency in ms
    error_rate_max: 0.01,   // Max 1% error rate
  };

  console.log("  Performance Thresholds (50K user target):");
  console.log(`    Min RPS:         ${THRESHOLDS.rps_min}`);
  console.log(`    Max p99 latency: ${THRESHOLDS.latency_p99_max}ms`);
  console.log(`    Max error rate:  ${(THRESHOLDS.error_rate_max * 100).toFixed(1)}%\n`);

  // Results table
  console.log("  " + "-".repeat(95));
  console.log(
    "  " +
    "Endpoint".padEnd(38) +
    "RPS".padStart(8) +
    "Avg".padStart(9) +
    "P99".padStart(9) +
    "Max".padStart(9) +
    "Errors".padStart(8) +
    "Grade".padStart(8)
  );
  console.log("  " + "-".repeat(95));

  for (const r of passed) {
    const errorRate = r.requests > 0 ? r.errors / r.requests : 0;
    let grade = "PASS";
    if (r.latencyP99 > THRESHOLDS.latency_p99_max) grade = "SLOW";
    if (r.rps < THRESHOLDS.rps_min) grade = "LOW-RPS";
    if (errorRate > THRESHOLDS.error_rate_max) grade = "ERRORS";
    if (r.errors > 0 && r.status5xx > 0) grade = "5xx!";

    console.log(
      "  " +
      `${r.method} ${r.url}`.padEnd(38) +
      formatNumber(r.rps).padStart(8) +
      formatLatency(r.latencyAvg).padStart(9) +
      formatLatency(r.latencyP99).padStart(9) +
      formatLatency(r.latencyMax).padStart(9) +
      String(r.errors).padStart(8) +
      grade.padStart(8)
    );
  }
  console.log("  " + "-".repeat(95));

  // Summary
  console.log(`\n  Total endpoints tested: ${allResults.length}`);
  console.log(`  Passed: ${passed.length} | Failed: ${failed.length}`);

  if (passed.length > 0) {
    const avgRPS = Math.round(passed.reduce((s, r) => s + r.rps, 0) / passed.length);
    const avgLatency = passed.reduce((s, r) => s + r.latencyAvg, 0) / passed.length;
    const maxP99 = Math.max(...passed.map((r) => r.latencyP99));
    const totalErrors = passed.reduce((s, r) => s + r.errors, 0);

    console.log(`\n  Aggregate:`);
    console.log(`    Average RPS:     ${formatNumber(avgRPS)}`);
    console.log(`    Average latency: ${formatLatency(avgLatency)}`);
    console.log(`    Worst p99:       ${formatLatency(maxP99)}`);
    console.log(`    Total errors:    ${totalErrors}`);
  }

  if (failed.length > 0) {
    console.log(`\n  Failed endpoints:`);
    for (const r of failed) {
      console.log(`    ${r.method} ${r.url}: ${r.error}`);
    }
  }

  console.log("");
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const apps = appArg === "all" ? Object.keys(TESTS) : [appArg];
  const allResults = [];

  for (const app of apps) {
    const results = await runAppTests(app);
    allResults.push(...results);
  }

  if (allResults.length > 0) {
    generateReport(allResults);
  } else {
    console.log("\nNo tests were run. Make sure the apps are running (npm run dev).\n");
  }
}

main().catch(console.error);
