#!/usr/bin/env node
/**
 * affected-apps.mjs — print which Vercel-deployed apps will actually rebuild
 * given a git diff range.
 *
 * Usage:
 *   node scripts/affected-apps.mjs                  # diff HEAD..origin/<current-branch>
 *   node scripts/affected-apps.mjs origin/main HEAD # explicit range
 *   node scripts/affected-apps.mjs <from> <to>      # any two refs
 *
 * Output:
 *   📦 Affected apps (will redeploy on Vercel):
 *      • quikscale  (apps/quikscale/**)
 *
 *   ⏭️  Unaffected (Vercel will skip via turbo-ignore):
 *      • quikit
 *      • admin
 *
 *   📁 Other changes (docs, CI, root config):
 *      • CLAUDE.md
 *      • docs/engineering/foo.md
 *
 * The "affected" list is what the user should be told before pushing.
 */

import { execSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

/**
 * Deployable apps, discovered from the filesystem rather than hardcoded.
 *
 * This used to be a literal list, which silently misreported every app added
 * after it was written. `quikpresales` was missing, so its changes classified as
 * "other — no deploy impact" and this check reported that nothing would
 * redeploy while pushing code that does. A stale allow-list here is worse than
 * no check at all, because the output looks authoritative.
 *
 * Anything under apps/ carrying a package.json is deployable. `_template` is the
 * scaffold — it is excluded from the npm workspaces at the repo root too.
 */
function discoverApps() {
  const appsDir = join(run("git rev-parse --show-toplevel"), "apps");
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "_template")
    .filter((e) => existsSync(join(appsDir, e.name, "package.json")))
    .map((e) => e.name)
    .sort();
}

const ALL_APPS = discoverApps();

function getRange() {
  const [, , a, b] = process.argv;
  if (a && b) return [a, b];
  // Default: current branch vs origin/<same-branch>
  const branch = run("git rev-parse --abbrev-ref HEAD");
  try {
    run(`git rev-parse --verify origin/${branch}`);
    return [`origin/${branch}`, "HEAD"];
  } catch {
    // No remote tracking branch yet — fall back to last commit only
    return ["HEAD~1", "HEAD"];
  }
}

function classify(path) {
  if (path.startsWith("apps/")) {
    const app = path.split("/")[1];
    if (ALL_APPS.includes(app)) return { kind: "app", app };
    return { kind: "other", path };
  }
  if (path.startsWith("packages/")) {
    const pkg = path.split("/")[1];
    // Shared packages affect every app that imports them. For our monorepo
    // today, every app imports every @quikit/* package — so any packages
    // change is a "rebuild everything" signal.
    return { kind: "shared", pkg };
  }
  return { kind: "other", path };
}

function main() {
  const [from, to] = getRange();
  let files;
  try {
    files = run(`git diff --name-only ${from}..${to}`).split("\n").filter(Boolean);
  } catch (err) {
    console.error(`Could not diff ${from}..${to}:`, err.message);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(`✅ No changes between ${from} and ${to}.`);
    return;
  }

  const affectedApps = new Set();
  const sharedPkgs = new Set();
  const otherPaths = [];

  for (const path of files) {
    const c = classify(path);
    if (c.kind === "app") affectedApps.add(c.app);
    else if (c.kind === "shared") sharedPkgs.add(c.pkg);
    else otherPaths.push(c.path);
  }

  // Shared package changes → every app is affected.
  if (sharedPkgs.size > 0) ALL_APPS.forEach((a) => affectedApps.add(a));

  const unaffected = ALL_APPS.filter((a) => !affectedApps.has(a));

  console.log(`Diff: ${from}..${to}  (${files.length} file${files.length === 1 ? "" : "s"} changed)\n`);

  if (affectedApps.size > 0) {
    console.log("📦 Affected apps (will redeploy on Vercel):");
    for (const app of [...affectedApps].sort()) {
      const reason = sharedPkgs.size > 0
        ? `shared package changed: ${[...sharedPkgs].join(", ")}`
        : `apps/${app}/**`;
      console.log(`   • ${app}  (${reason})`);
    }
    console.log();
  } else {
    console.log("📦 No app code changed.\n");
  }

  if (unaffected.length > 0 && affectedApps.size > 0) {
    console.log("⏭️  Unaffected (Vercel will skip via turbo-ignore):");
    for (const app of unaffected) console.log(`   • ${app}`);
    console.log();
  }

  if (otherPaths.length > 0) {
    console.log("📁 Other changes (docs, CI, root config — no deploy impact):");
    for (const p of otherPaths) console.log(`   • ${p}`);
    console.log();
  }
}

main();
