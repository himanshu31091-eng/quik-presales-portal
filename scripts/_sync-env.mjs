#!/usr/bin/env node
// Sync selected env vars from each app's .env.local into the Vercel project
// (Production target). Keeps existing production URL vars untouched, skips
// localhost/empty values, un-escapes the dotenv `\$` used in SMTP passwords.
//
// Usage:
//   node scripts/_sync-env.mjs            # dry-run (prints plan, no writes)
//   node scripts/_sync-env.mjs --apply    # apply via Vercel REST API
//   node scripts/_sync-env.mjs --apply quikscale   # single app

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const authPath = `${process.env.APPDATA || process.env.HOME + "/.local/share"}/xdg.data/com.vercel.cli/auth.json`;
const TOKEN = JSON.parse(readFileSync(authPath, "utf8")).token;

const TEAM_MAIN = "team_aQUO0PTjyXj39k2iGG2SvQfF";
const TEAM_CRM = "team_Lfkv91QyT8ZsudPdIhrVs2ns";

// app -> { projectId, teamId }
const APPS = {
  quikit:     { projectId: "prj_84k3KCzCwsNtbxI19x42zca0M73b", teamId: TEAM_MAIN },
  auth:       { projectId: "prj_t1kpx18ZEodlb5bdgvXNJ0d4upnI", teamId: TEAM_MAIN },
  admin:      { projectId: "prj_86pK2Gv5kKwV9EnlV5B8ZxfSwiG1", teamId: TEAM_MAIN },
  quikscale:  { projectId: "prj_4RNX0V7CsdKNgVke81T2jXlh7ynB", teamId: TEAM_MAIN },
  quiktrack:  { projectId: "prj_5eCEmzjOyHznMRckLJhP6lIfm73M", teamId: TEAM_MAIN },
  quiksocial: { projectId: "prj_LCmE4d6aZ2Gnnz8tv8M9BcLPhDbh", teamId: TEAM_MAIN },
  quikinfra:  { projectId: "prj_WASKGWNyD3lSvrjaBX54cigRy3Xw", teamId: TEAM_MAIN },
  quikcrm:    { projectId: "prj_PZYJmgOJsygF3nEiDIvjGV4paqMQ", teamId: TEAM_CRM },
};

// URL / cross-app / redirect / infra keys whose PRODUCTION values must NOT be
// overwritten with the localhost values from .env.local. Kept as-is on Vercel.
const DENY_KEYS = new Set([
  "NEXTAUTH_URL", "APP_URL",
  "QUIKIT_URL", "QUIKIT_ISSUER_URL",
  "ADMIN_URL", "QUIKSCALE_URL", "QUIKTRACK_URL", "QUIKINFRA_URL",
  "QUIKSOCIAL_URL", "QUIKVC_URL", "QUIKCRM_URL", "QUIKASSET_URL",
  "NEXT_PUBLIC_AUTH_URL", "NEXT_PUBLIC_LAUNCHER_URL", "NEXT_PUBLIC_ADMIN_URL",
  "NEXT_PUBLIC_QUIKIT_URL", "NEXT_PUBLIC_SUPER_ADMIN_URL",
  "NEXT_PUBLIC_QUIKINFRA_URL", "NEXT_PUBLIC_QUIKTRACK_URL",
  "NEXT_PUBLIC_QUIKCRM_URL", "NEXT_PUBLIC_QUIKSCALE_URL", "NEXT_PUBLIC_QUIKASSET_URL",
  "REDIS_URL",
  "AUTH_ALLOWED_RETURN_ORIGINS", "AUTH_CORS_ORIGINS",
  "MICROSOFT_REDIRECT_URI", "MICROSOFT_CALENDAR_REDIRECT_URL",
  "GMAIL_REDIRECT_URI",
]);

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding matching quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // un-escape dotenv `\$` (used so Next's dotenv-expand doesn't eat $24)
    val = val.replace(/\\\$/g, "$");
    out[key] = val;
  }
  return out;
}

function buildSyncSet(app) {
  const envPath = resolve(repoRoot, "apps", app, ".env.local");
  const parsed = parseEnv(readFileSync(envPath, "utf8"));
  const sync = {};
  const skipped = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (DENY_KEYS.has(k)) { skipped.push([k, "deny(url/infra)"]); continue; }
    if (v === "") { skipped.push([k, "empty"]); continue; }
    if (/localhost/i.test(v)) { skipped.push([k, "localhost"]); continue; }
    sync[k] = v;
  }
  return { sync, skipped };
}

function mask(v) {
  if (v.length <= 8) return "*".repeat(v.length);
  return v.slice(0, 4) + "…" + v.slice(-4) + ` (${v.length})`;
}

async function upsertEnv(app, key, value) {
  const { projectId, teamId } = APPS[app];
  const url = `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}&upsert=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, type: "encrypted", target: ["production"] }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const only = args.find((a) => !a.startsWith("--"));
const targets = only ? [only] : Object.keys(APPS);

for (const app of targets) {
  const { sync, skipped } = buildSyncSet(app);
  console.log(`\n=== ${app} ===`);
  console.log(`  will set ${Object.keys(sync).length} vars (production):`);
  for (const [k, v] of Object.entries(sync)) {
    const sensitive = /SECRET|PASS|TOKEN|KEY|PASSWORD|DATABASE_URL/i.test(k);
    console.log(`    ${k} = ${sensitive ? mask(v) : v}`);
  }
  console.log(`  skipped ${skipped.length}: ${skipped.map(([k]) => k).join(", ")}`);

  if (APPLY) {
    for (const [k, v] of Object.entries(sync)) {
      const r = await upsertEnv(app, k, v);
      if (!r.ok) console.log(`    ✗ ${k}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    }
    console.log(`  ✅ applied`);
  }
}
console.log(`\n${APPLY ? "Applied." : "Dry-run complete. Re-run with --apply to write."}`);
