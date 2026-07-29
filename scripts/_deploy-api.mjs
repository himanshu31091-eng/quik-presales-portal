#!/usr/bin/env node
// Deploy via Vercel REST API. No `.git` reading. No `vercel deploy` CLI.

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const authPath = `${process.env.APPDATA || process.env.HOME + "/.local/share"}/xdg.data/com.vercel.cli/auth.json`;
const TOKEN = JSON.parse(readFileSync(authPath, "utf8")).token;
const TEAM = "team_aQUO0PTjyXj39k2iGG2SvQfF";

const APP_PROJECTS = {
  quikit:     "prj_84k3KCzCwsNtbxI19x42zca0M73b",
  auth:       "prj_t1kpx18ZEodlb5bdgvXNJ0d4upnI",
  admin:      "prj_86pK2Gv5kKwV9EnlV5B8ZxfSwiG1",
  quikscale:  "prj_4RNX0V7CsdKNgVke81T2jXlh7ynB",
  quiktrack:  "prj_5eCEmzjOyHznMRckLJhP6lIfm73M",
  quikvc:     "prj_eZEAmetQjPnLcSUQf7FoZIOvUCem",
  quiksocial: "prj_LCmE4d6aZ2Gnnz8tv8M9BcLPhDbh",
  quikinfra:  "prj_WASKGWNyD3lSvrjaBX54cigRy3Xw",
  quikcrm:    "prj_uVjy9agPOR7zRkEyfiDFeEJ4reLE",
};
const ALL_APPS = Object.keys(APP_PROJECTS);

function shouldIgnore(p, currentApp) {
  if (p === ".git" || p.startsWith(".git/")) return true;
  if (p === ".git-disabled-for-deploy" || p.startsWith(".git-disabled-for-deploy/")) return true;
  if (p === ".github" || p.startsWith(".github/")) return true;
  if (p === ".husky" || p.startsWith(".husky/")) return true;
  if (p === ".claude" || p.startsWith(".claude/")) return true;
  if (p === ".vscode" || p.startsWith(".vscode/")) return true;
  if (p.startsWith("Daily_clean_Report/")) return true;
  if (p === ".env" || p.endsWith("/.env")) return true;
  if (p.endsWith(".env.local") || p.endsWith(".env.local.example")) return true;
  if (/(^|\/)\.env\.[a-z]+\.local$/.test(p)) return true;
  if (p === "node_modules" || p.startsWith("node_modules/")) return true;
  if (p.includes("/node_modules/")) return true;
  if (p.includes("/.next/") || p.endsWith("/.next")) return true;
  if (p.includes("/.turbo/") || p.endsWith("/.turbo")) return true;
  if (p.includes("/coverage/") || p.endsWith("/coverage")) return true;
  if (p.endsWith(".tsbuildinfo")) return true;
  if (p.startsWith("tasks/")) return true;
  if (p.startsWith("apps/_template/")) return true;
  if (p === "apps/quikscale.zip") return true;

  for (const otherApp of ALL_APPS) {
    if (otherApp === currentApp) continue;
    const appPrefix = `apps/${otherApp}/`;
    if (p === `apps/${otherApp}` || p.startsWith(appPrefix)) {
      const after = p.startsWith(appPrefix) ? p.slice(appPrefix.length) : "";
      if (after === "package.json" || after === "next.config.js" || after === "tsconfig.json" || after === "vercel.json") return false;
      return true;
    }
  }
  return false;
}

function walkFiles(dir, currentApp, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    const rel = relative(repoRoot, full).split(/[\\/]/).join("/");
    if (shouldIgnore(rel, currentApp)) continue;
    if (ent.isDirectory()) walkFiles(full, currentApp, out);
    else if (ent.isFile()) out.push({ full, rel });
  }
  return out;
}

async function fetchT(url, opts, ms) {
  // fetch with a hard timeout — a stalled connection aborts instead of hanging forever.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function uploadFile(buffer, sha) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetchT(`https://api.vercel.com/v2/files?teamId=${TEAM}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Length": String(buffer.length), "x-vercel-digest": sha },
        body: buffer,
      }, 30000);
      if (res.ok) return true;
      const txt = await res.text();
      if (res.status === 409 || /already exists/i.test(txt)) return true;
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 3000 + 2000 * attempt)); continue; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return false;
}

async function deployApp(app) {
  const projectId = APP_PROJECTS[app];
  if (!projectId) { console.log(`skip ${app}`); return; }
  console.log(`\n=== ${app} ===`);

  const files = walkFiles(repoRoot, app);
  console.log(`  walked ${files.length} files`);

  const manifest = [];
  let totalSize = 0;
  for (const f of files) {
    const buf = readFileSync(f.full);
    const sha = createHash("sha1").update(buf).digest("hex");
    totalSize += buf.length;
    manifest.push({ file: f.rel, sha, size: buf.length, _buf: buf });
  }
  console.log(`  total: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

  let uploaded = 0;
  const queue = [...manifest];
  const UPLOAD_CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY || 3);
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
    while (queue.length) {
      const m = queue.shift();
      if (!m) break;
      await uploadFile(m._buf, m.sha);
      uploaded++;
      if (uploaded % 100 === 0) console.log(`    uploaded ${uploaded}/${manifest.length}`);
    }
  }));
  console.log(`  uploaded ${uploaded}/${manifest.length}`);

  const bySha = new Map(manifest.map((m) => [m.sha, m]));
  async function postDeploy() {
    const r = await fetchT(`https://api.vercel.com/v13/deployments?teamId=${TEAM}&forceNew=1&skipAutoDetectionConfirmation=1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: app, project: projectId, target: "production", files: manifest.map(({ file, sha, size }) => ({ file, sha, size })), version: 2 }),
    }, 30000);
    return { ok: r.ok, body: await r.json() };
  }

  let { ok, body: j } = await postDeploy();
  for (let retry = 0; (!ok || j.error?.code === "missing_files") && retry < 6; retry++) {
    if (j.error?.code === "missing_files" && Array.isArray(j.error.missing)) {
      console.log(`  re-uploading ${j.error.missing.length} missing files (retry ${retry + 1})…`);
      for (const sha of j.error.missing) {
        const m = bySha.get(sha);
        if (m) await uploadFile(m._buf, sha);
      }
      await new Promise((r) => setTimeout(r, 5000));
      ({ ok, body: j } = await postDeploy());
    } else { break; }
  }
  if (!ok || j.error) { console.log(`  DEPLOY FAILED:`, JSON.stringify(j).slice(0, 400)); return null; }
  console.log(`  id: ${j.id}`);
  console.log(`  url: https://${j.url}`);

  const start = Date.now();
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetchT(`https://api.vercel.com/v13/deployments/${j.id}?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } }, 20000).catch(() => null);
    if (!r) continue;
    const jj = await r.json();
    const state = jj.readyState || jj.state;
    if (state === "READY") { console.log(`  ✅ READY in ${Math.round((Date.now() - start) / 1000)}s`); return jj; }
    if (state === "ERROR" || state === "CANCELED") { console.log(`  ❌ ${state}: ${jj.errorMessage || ""}`); return jj; }
    if (i % 4 === 0) console.log(`    [${state}] ${Math.round((Date.now() - start) / 1000)}s`);
  }
  return j;
}

const which = process.argv[2];
const targets = which ? [which] : ALL_APPS;
for (const app of targets) await deployApp(app);
console.log("\nAll done.");
