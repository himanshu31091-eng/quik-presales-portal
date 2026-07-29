// Attempt to CREATE a quikcrm production deployment from the current file
// manifest WITHOUT bulk-uploading (the /v2/files quota is exhausted). If all
// file blobs already exist server-side (from prior attempts), this succeeds.
// Reports missing_files count so we know if it's viable.

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const TOKEN = JSON.parse(readFileSync(process.env.APPDATA + "/xdg.data/com.vercel.cli/auth.json", "utf8")).token;
const TEAM = "team_aQUO0PTjyXj39k2iGG2SvQfF";
const PROJECT = "prj_uVjy9agPOR7zRkEyfiDFeEJ4reLE";
const app = "quikcrm";
const ALL_APPS = ["quikit", "auth", "admin", "quikscale", "quiktrack", "quikvc", "quiksocial", "quikinfra", "quikcrm"];

function shouldIgnore(p, cur) {
  if (/^\.git(\/|$)|^\.github(\/|$)|^\.husky(\/|$)|^\.claude(\/|$)|^\.vscode(\/|$)/.test(p)) return true;
  if (p === ".env" || p.endsWith("/.env") || p.endsWith(".env.local")) return true;
  if (/(^|\/)\.env\.[a-z]+\.local$/.test(p)) return true;
  if (p === "node_modules" || p.startsWith("node_modules/") || p.includes("/node_modules/")) return true;
  if (p.includes("/.next/") || p.endsWith("/.next") || p.includes("/.turbo/") || p.includes("/coverage/")) return true;
  if (p.endsWith(".tsbuildinfo") || p.startsWith("tasks/") || p.startsWith("apps/_template/")) return true;
  for (const o of ALL_APPS) { if (o === cur) continue; const pre = `apps/${o}/`; if (p === `apps/${o}` || p.startsWith(pre)) { const a = p.startsWith(pre) ? p.slice(pre.length) : ""; if (["package.json","next.config.js","tsconfig.json","vercel.json"].includes(a)) return false; return true; } }
  return false;
}
function walk(dir, cur, out = []) { let e; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return out; } for (const x of e) { const full = join(dir, x.name); const rel = relative(repoRoot, full).split(/[\\/]/).join("/"); if (shouldIgnore(rel, cur)) continue; if (x.isDirectory()) walk(full, cur, out); else if (x.isFile()) out.push({ full, rel }); } return out; }

const files = walk(repoRoot, app);
const manifest = files.map((f) => { const buf = readFileSync(f.full); return { file: f.rel, sha: createHash("sha1").update(buf).digest("hex"), size: buf.length, _buf: buf }; });
console.log(`manifest: ${manifest.length} files`);

async function uploadOne(buf, sha) {
  for (let i = 0; i < 3; i++) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
    try { const r = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM}`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Length": String(buf.length), "x-vercel-digest": sha }, body: buf, signal: c.signal }); if (r.ok || r.status === 409) return true; if (r.status === 429) return false; } catch {} finally { clearTimeout(t); }
  }
  return false;
}
async function create() {
  const r = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM}&forceNew=1&skipAutoDetectionConfirmation=1`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: app, project: PROJECT, target: "production", files: manifest.map(({ file, sha, size }) => ({ file, sha, size })), version: 2 }) });
  return { ok: r.ok, body: await r.json() };
}

let { ok, body } = await create();
for (let retry = 0; (!ok || body.error?.code === "missing_files") && retry < 5; retry++) {
  if (body.error?.code === "missing_files" && Array.isArray(body.error.missing)) {
    console.log(`missing ${body.error.missing.length} files (retry ${retry + 1}) — trying to upload just those…`);
    const bySha = new Map(manifest.map((m) => [m.sha, m]));
    let uploadedOk = 0, failed = 0;
    for (const sha of body.error.missing) { const m = bySha.get(sha); if (m) { (await uploadOne(m._buf, sha)) ? uploadedOk++ : failed++; } }
    console.log(`  uploaded ${uploadedOk}, failed(429?) ${failed}`);
    if (failed > 0) { console.log("  → quota blocking remaining uploads; cannot complete now."); break; }
    ({ ok, body } = await create());
  } else break;
}
if (ok && !body.error) { console.log(`✅ deployment created: ${body.id}  https://${body.url}  state=${body.readyState || body.status}`); console.log("Poll the build separately."); }
else console.log("❌ create failed:", JSON.stringify(body.error || body).slice(0, 300));
