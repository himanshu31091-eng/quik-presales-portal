#!/usr/bin/env node
// Verify the LIVE production deployment of auth/quikit/admin was built from the
// CURRENT local source, by comparing local file SHA-1 (same digest Vercel uses)
// against the deployment's uploaded file manifest.

import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const TOKEN = JSON.parse(readFileSync(process.env.APPDATA + "/xdg.data/com.vercel.cli/auth.json", "utf8")).token;
const TEAM = "team_aQUO0PTjyXj39k2iGG2SvQfF";

const PROJ = {
  auth: { id: "prj_t1kpx18ZEodlb5bdgvXNJ0d4upnI", files: ["packages/auth/session-store.ts", "packages/auth/index.ts", "apps/auth/app/api/health/route.ts", "apps/auth/package.json"] },
  quikit: { id: "prj_84k3KCzCwsNtbxI19x42zca0M73b", files: ["packages/auth/session-store.ts", "apps/quikit/app/api/health/route.ts", "apps/quikit/next.config.js"] },
  admin: { id: "prj_86pK2Gv5kKwV9EnlV5B8ZxfSwiG1", files: ["packages/auth/session-store.ts", "apps/admin/app/api/health/route.ts", "apps/admin/package.json"] },
};

function sha1(p) {
  try { return createHash("sha1").update(readFileSync(resolve(repoRoot, p))).digest("hex"); }
  catch { return null; }
}

async function api(path) {
  const r = await fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return r.json();
}

function flatten(tree, acc = new Set()) {
  for (const n of tree || []) {
    if (n.type === "file" && n.uid) acc.add(n.uid);
    if (n.children) flatten(n.children, acc);
  }
  return acc;
}

const headCommit = "d8d05dd (common_setup17)";
console.log(`local HEAD: ${headCommit}\n`);

for (const [app, { id, files }] of Object.entries(PROJ)) {
  const deps = await api(`/v6/deployments?projectId=${id}&target=production&limit=1`);
  const d = deps.deployments?.[0];
  if (!d) { console.log(`${app}: no production deployment`); continue; }
  const created = new Date(d.created).toISOString();
  const ageMin = Math.round((Date.now() - d.created) / 60000);
  console.log(`=== ${app} ===`);
  console.log(`  deployment ${d.uid} | state ${d.readyState} | created ${created} (${ageMin} min ago)`);
  console.log(`  source: ${d.source || "?"}  gitSource: ${d.meta?.githubCommitSha ? d.meta.githubCommitSha.slice(0,8) : "none (file upload)"}`);

  const detail = await api(`/v13/deployments/${d.uid}`);
  const tree = await api(`/v6/deployments/${d.uid}/files`);
  const shas = flatten(tree);
  console.log(`  manifest files: ${shas.size}`);
  for (const f of files) {
    const local = sha1(f);
    if (!local) { console.log(`    ?  ${f} — local file missing`); continue; }
    const match = shas.has(local);
    console.log(`    ${match ? "✅" : "❌"} ${f}  sha1=${local.slice(0, 12)}  ${match ? "present in deployed build (CURRENT)" : "NOT in deployed build"}`);
  }
  console.log();
}
