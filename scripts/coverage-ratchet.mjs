#!/usr/bin/env node
/**
 * Coverage ratchet.
 *
 * Compares the current `coverage/coverage-summary.json` (produced by
 * `vitest run --coverage`) to the committed `coverage-baseline.json` at
 * the repo root, and exits non-zero if ANY of lines/statements/functions/
 * branches has dropped by more than the tolerance.
 *
 * Usage (in CI, after running tests with coverage):
 *   node scripts/coverage-ratchet.mjs apps/quikscale/coverage/coverage-summary.json
 *
 * Updating the baseline (after intentionally adding tests):
 *   node scripts/coverage-ratchet.mjs apps/quikscale/coverage/coverage-summary.json --update
 *   git add coverage-baseline.json && git commit -m "chore: ratchet coverage baseline"
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, "..", "coverage-baseline.json");
const TOLERANCE = 0.25; // percentage points — allow tiny floating-point drift

const [, , summaryArg, ...flags] = process.argv;
const UPDATE = flags.includes("--update");

if (!summaryArg) {
  console.error("Usage: coverage-ratchet.mjs <path/to/coverage-summary.json> [--update]");
  process.exit(2);
}

const summaryPath = resolve(process.cwd(), summaryArg);
if (!existsSync(summaryPath)) {
  console.error(`Coverage summary not found at ${summaryPath}. Run tests with --coverage first.`);
  process.exit(2);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const current = summary.total;

if (!current) {
  console.error("coverage-summary.json has no `total` key — wrong file?");
  process.exit(2);
}

const metrics = ["lines", "statements", "functions", "branches"];
const currentPct = Object.fromEntries(metrics.map((m) => [m, current[m].pct]));

if (UPDATE || !existsSync(BASELINE_PATH)) {
  writeFileSync(BASELINE_PATH, JSON.stringify(currentPct, null, 2) + "\n");
  console.log("✅ Baseline updated:");
  for (const m of metrics) console.log(`   ${m.padEnd(11)} ${currentPct[m].toFixed(2)}%`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const failures = [];

for (const m of metrics) {
  const was = baseline[m] ?? 0;
  const now = currentPct[m];
  const delta = now - was;
  const icon = delta >= 0 ? "✅" : delta >= -TOLERANCE ? "≈" : "❌";
  const sign = delta >= 0 ? "+" : "";
  console.log(`${icon} ${m.padEnd(11)} ${was.toFixed(2)}% → ${now.toFixed(2)}% (${sign}${delta.toFixed(2)})`);
  if (delta < -TOLERANCE) failures.push(m);
}

if (failures.length > 0) {
  console.error(
    `\n❌ Coverage ratchet failed: ${failures.join(", ")} dropped > ${TOLERANCE} points.\n` +
      `Either add tests to restore coverage, or if the drop is intentional, update the baseline:\n` +
      `    node scripts/coverage-ratchet.mjs ${summaryArg} --update`
  );
  process.exit(1);
}

console.log("\n✅ Coverage ratchet passed.");
process.exit(0);
