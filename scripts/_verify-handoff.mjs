#!/usr/bin/env node
// Verify the cross-domain SSO handoff: login@auth -> /api/post-login -> mints
// token -> quikit/auth-handoff sets per-host session -> /api/org/memberships 200.
// Creds via env (TEST_EMAIL/TEST_PASSWORD), never written to disk.

const AUTH = "https://auth-pravin-sharmas-projects-cb2dd481.vercel.app";
const QUIKIT = "https://quikit-pravin-sharmas-projects-cb2dd481.vercel.app";
const EMAIL = process.env.TEST_EMAIL, PASSWORD = process.env.TEST_PASSWORD;
const pass = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`  •  ${m}`);

const jars = { auth: {}, quikit: {} };
function absorb(host, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) { const [kv] = c.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === "" || v === "deleted") delete jars[host][k]; else jars[host][k] = v; }
}
const ck = (host) => Object.entries(jars[host]).map(([k, v]) => `${k}=${v}`).join("; ");

(async () => {
  console.log("\n=== 1. login @ auth ===");
  const csrf = await fetch(`${AUTH}/api/auth/csrf`); absorb("auth", csrf);
  const { csrfToken } = await csrf.json();
  const body = new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: AUTH, json: "true" });
  const login = await fetch(`${AUTH}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ck("auth") }, body, redirect: "manual" });
  absorb("auth", login);
  Object.keys(jars.auth).some((k) => /session-token/.test(k)) ? pass("auth session cookie issued") : fail("no auth session cookie");

  console.log("\n=== 2. /api/post-login (should mint handoff token now) ===");
  const pl = await fetch(`${AUTH}/api/post-login?callbackUrl=${encodeURIComponent(QUIKIT + "/apps")}`, { headers: { Cookie: ck("auth") }, redirect: "manual" });
  const loc = pl.headers.get("location") || "";
  info(`post-login → ${pl.status} → ${loc.slice(0, 120)}`);
  const isHandoff = /\/auth-handoff\?token=/.test(loc);
  isHandoff ? pass("redirected to quikit /auth-handoff WITH token (bridge working)") : fail(`NO handoff token — bridge still rejecting origin (loc=${loc.slice(0,90)})`);

  if (!isHandoff) { console.log("\nStopping — handoff not minted."); return; }

  console.log("\n=== 3. quikit /auth-handoff sets per-host session ===");
  const ho = await fetch(loc, { redirect: "manual" });
  absorb("quikit", ho);
  const hloc = ho.headers.get("location") || "";
  info(`auth-handoff → ${ho.status} → ${hloc.slice(0, 90)}`);
  Object.keys(jars.quikit).some((k) => /session-token/.test(k)) ? pass("quikit per-host session cookie set") : fail("quikit set no session cookie");

  console.log("\n=== 4. quikit /api/org/memberships (was 401) ===");
  const mem = await fetch(`${QUIKIT}/api/org/memberships`, { headers: { Cookie: ck("quikit") } });
  let mb = ""; try { mb = JSON.stringify(await mem.clone().json()); } catch {}
  info(`memberships → ${mem.status}  ${mb.slice(0, 160)}`);
  if (mem.status === 401) fail("STILL 401 — session not accepted");
  else if (mem.status === 200) pass(`200 OK — session accepted (orgs: ${(JSON.parse(mb).data || []).length})`);
  else info(`status ${mem.status}`);

  console.log("\n=== 5. quikit /api/auth/session ===");
  const s = await fetch(`${QUIKIT}/api/auth/session`, { headers: { Cookie: ck("quikit") } });
  const sj = await s.json();
  sj && sj.user ? pass(`session.user = ${sj.user.email || JSON.stringify(sj.user)}`) : fail(`empty session: ${JSON.stringify(sj)}`);
})().catch((e) => { console.error(e); process.exit(1); });
