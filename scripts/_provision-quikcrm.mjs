#!/usr/bin/env node
// Provision a fresh `quikcrm` Vercel project under the main team
// (pravin sharma's projects), mirroring the other apps' build settings,
// and set ALL env vars it needs: non-URL secrets from apps/quikcrm/.env.local
// (un-escaped, localhost/empty skipped) PLUS the cross-app URL vars pointed at
// the production *.vercel.app URLs. Idempotent: re-running updates in place.
//
//   node scripts/_provision-quikcrm.mjs            # dry-run
//   node scripts/_provision-quikcrm.mjs --apply

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const TOKEN = JSON.parse(readFileSync(`${process.env.APPDATA || process.env.HOME + "/.local/share"}/xdg.data/com.vercel.cli/auth.json`, "utf8")).token;
const TEAM = "team_aQUO0PTjyXj39k2iGG2SvQfF";
const APPLY = process.argv.includes("--apply");

const PROD = (app) => `https://${app}-pravin-sharmas-projects-cb2dd481.vercel.app`;

// Cross-app + own URL vars (production values).
const URL_VARS = {
  NEXTAUTH_URL: PROD("quikcrm"),
  NEXT_PUBLIC_QUIKCRM_URL: PROD("quikcrm"),
  QUIKCRM_URL: PROD("quikcrm"),
  QUIKIT_URL: PROD("quikit"),
  QUIKIT_ISSUER_URL: PROD("quikit"),
  NEXT_PUBLIC_QUIKIT_URL: PROD("quikit"),
  NEXT_PUBLIC_SUPER_ADMIN_URL: PROD("quikit"),
  NEXT_PUBLIC_AUTH_URL: PROD("auth"),
  ADMIN_URL: PROD("admin"),
  QUIKSCALE_URL: PROD("quikscale"),
  QUIKTRACK_URL: PROD("quiktrack"),
  QUIKINFRA_URL: PROD("quikinfra"),
  QUIKSOCIAL_URL: PROD("quiksocial"),
  QUIKVC_URL: PROD("quikvc"),
};

const DENY = new Set([...Object.keys(URL_VARS), "REDIS_URL", "AUTH_ALLOWED_RETURN_ORIGINS",
  "AUTH_CORS_ORIGINS", "MICROSOFT_REDIRECT_URI", "MICROSOFT_CALENDAR_REDIRECT_URL", "GMAIL_REDIRECT_URI", "APP_URL"]);

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq === -1) continue;
    let k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    v = v.replace(/\\\$/g, "$");
    out[k] = v;
  }
  return out;
}

const parsed = parseEnv(readFileSync(resolve(repoRoot, "apps/quikcrm/.env.local"), "utf8"));
const secrets = {};
for (const [k, v] of Object.entries(parsed)) {
  if (DENY.has(k)) continue;
  if (v === "" || /localhost/i.test(v)) continue;
  secrets[k] = v;
}
const ALL = { ...secrets, ...URL_VARS };

async function api(method, path, body) {
  const r = await fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

console.log(`quikcrm provision — ${Object.keys(ALL).length} env vars (${Object.keys(secrets).length} secrets + ${Object.keys(URL_VARS).length} url)`);
console.log("URL vars:");
for (const [k, v] of Object.entries(URL_VARS)) console.log(`  ${k} = ${v}`);
console.log("secrets:", Object.keys(secrets).join(", "));

if (!APPLY) { console.log("\nDry-run. Re-run with --apply."); process.exit(0); }

// 1. Find or create project
let proj = await api("GET", `/v9/projects/quikcrm`);
let projectId;
if (proj.ok) {
  projectId = proj.body.id;
  console.log(`\nProject exists: ${projectId}`);
} else {
  const created = await api("POST", `/v11/projects`, {
    name: "quikcrm",
    framework: "nextjs",
    buildCommand: "npx turbo run build --filter=quikcrm",
    installCommand: "npm install",
    outputDirectory: "apps/quikcrm/.next",
  });
  if (!created.ok) { console.log("CREATE FAILED:", JSON.stringify(created.body).slice(0, 300)); process.exit(1); }
  projectId = created.body.id;
  console.log(`\nProject created: ${projectId}`);
}
// match node version 24.x
await api("PATCH", `/v9/projects/${projectId}`, { nodeVersion: "24.x" });

// 2. Upsert env vars (production)
let okc = 0, fail = 0;
for (const [k, v] of Object.entries(ALL)) {
  const r = await api("POST", `/v10/projects/${projectId}/env?upsert=true`, { key: k, value: v, type: "encrypted", target: ["production"] });
  if (r.ok) okc++; else { fail++; console.log(`  ✗ ${k}: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`); }
}
console.log(`env: ${okc} ok, ${fail} failed`);
console.log(`PROJECT_ID=${projectId}`);
