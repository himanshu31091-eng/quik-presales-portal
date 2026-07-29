// Generic: create a production deployment from the current file manifest,
// uploading ONLY the files Vercel is missing (resilient to flaky /v2/files).
// Usage: node scripts/_create-deploy.mjs <app> <projectId>

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const AUTH_PATH = process.env.APPDATA + "/xdg.data/com.vercel.cli/auth.json";
const tok = () => JSON.parse(readFileSync(AUTH_PATH, "utf8")).token; // re-read each call: CLI rotates it
const TEAM = "team_aQUO0PTjyXj39k2iGG2SvQfF";
const app = process.argv[2];
const PROJECT = process.argv[3];
if (!app || !PROJECT) { console.error("usage: _create-deploy.mjs <app> <projectId>"); process.exit(1); }
const ALL_APPS = ["quikit", "auth", "admin", "quikscale", "quiktrack", "quikvc", "quiksocial", "quikinfra", "quikcrm", "quikhrms"];

function shouldIgnore(p, cur) {
  if (/^\.git(\/|$)|^\.github(\/|$)|^\.husky(\/|$)|^\.claude(\/|$)|^\.vscode(\/|$)/.test(p)) return true;
  if (p === ".env" || p.endsWith("/.env") || p.endsWith(".env.local")) return true;
  if (/(^|\/)\.env\.[a-z]+\.local$/.test(p)) return true;
  if (p === "node_modules" || p.startsWith("node_modules/") || p.includes("/node_modules/")) return true;
  if (p.includes("/.next/") || p.endsWith("/.next") || p.includes("/.turbo/") || p.includes("/coverage/")) return true;
  if (p.endsWith(".tsbuildinfo") || p.startsWith("tasks/") || p.startsWith("apps/_template/")) return true;
  if (p.endsWith(".log")) return true;
  for (const o of ALL_APPS) { if (o === cur) continue; const pre = `apps/${o}/`; if (p === `apps/${o}` || p.startsWith(pre)) { const a = p.startsWith(pre) ? p.slice(pre.length) : ""; if (["package.json","next.config.js","tsconfig.json","vercel.json"].includes(a)) return false; return true; } }
  return false;
}
function walk(dir, cur, out = []) { let e; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return out; } for (const x of e) { const full = join(dir, x.name); const rel = relative(repoRoot, full).split(/[\\/]/).join("/"); if (shouldIgnore(rel, cur)) continue; if (x.isDirectory()) walk(full, cur, out); else if (x.isFile()) out.push({ full, rel }); } return out; }

const manifest = walk(repoRoot, app).map((f) => { const buf = readFileSync(f.full); return { file: f.rel, sha: createHash("sha1").update(buf).digest("hex"), size: buf.length, _buf: buf }; });
console.log(`${app}: manifest ${manifest.length} files`);

async function uploadOne(buf, sha) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
  try { const r = await fetch(`https://api.vercel.com/v2/files?teamId=${TEAM}`, { method: "POST", headers: { Authorization: `Bearer ${tok()}`, "Content-Length": String(buf.length), "x-vercel-digest": sha }, body: buf, signal: c.signal }); return r.ok || r.status === 409; }
  catch { return false; } finally { clearTimeout(t); }
}
async function create() {
  try {
    const r = await fetch(`https://api.vercel.com/v13/deployments?teamId=${TEAM}&forceNew=1&skipAutoDetectionConfirmation=1`, { method: "POST", headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: app, project: PROJECT, target: "production", files: manifest.map(({ file, sha, size }) => ({ file, sha, size })), version: 2 }) });
    return { ok: r.ok, status: r.status, body: await r.json() };
  } catch (e) {
    return { ok: false, body: { error: { code: "network", message: String(e?.message || e) } } };
  }
}

const bySha = new Map(manifest.map((m) => [m.sha, m]));
let lastMissing = Infinity;
for (let round = 0; round < 40; round++) {
  let { ok, body } = await create();
  if (ok && !body.error) { console.log(`✅ created: ${body.id}  https://${body.url}  ${body.readyState || body.status}`); process.exit(0); }
  // Transient auth flap (CLI rotating token) → wait and retry, don't abort.
  if (body.error?.code === "forbidden" || body.error?.invalidToken || body.error?.code === "network") { console.log(`round ${round + 1}: transient ${body.error?.code || "auth"} — retrying`); await new Promise((r) => setTimeout(r, 4000)); continue; }
  if (body.error?.code !== "missing_files" || !Array.isArray(body.error.missing)) { console.log("❌ create failed:", JSON.stringify(body.error || body).slice(0, 200)); process.exit(1); }
  const missing = body.error.missing;
  let okc = 0;
  for (const sha of missing) { const m = bySha.get(sha); if (m && await uploadOne(m._buf, sha)) okc++; }
  console.log(`round ${round + 1}: missing ${missing.length}, uploaded ${okc}`);
  if (missing.length >= lastMissing && okc === 0) { await new Promise((r) => setTimeout(r, 5000)); } // no progress → wait for flaky endpoint
  lastMissing = missing.length;
}
console.log("gave up after 40 rounds");
