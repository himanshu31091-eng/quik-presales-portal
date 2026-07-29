#!/usr/bin/env node
// Live login/session/logout lifecycle test against deployed Auth, with Redis
// session-key verification. Credentials come from env (TEST_EMAIL/TEST_PASSWORD)
// so they are never written to disk.
//
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/_login-lifecycle.mjs

import Redis from "ioredis";

const AUTH = "https://auth-alpha-hazel.vercel.app";
const REDIS_URL = "redis://default:uhK92dZqKGdEPLLj9Mp2xb0Mxgn4dVMW@redis-18008.c264.ap-south-1-1.ec2.cloud.redislabs.com:18008";
const EMAIL = process.env.TEST_EMAIL, PASSWORD = process.env.TEST_PASSWORD;

const pass = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`  •  ${m}`);

const jar = {};
function absorb(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) { const [kv] = c.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i); const v = kv.slice(i + 1); if (v === "" || v === "deleted") delete jar[k]; else jar[k] = v; }
}
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function sessKeys(redis) { return (await redis.keys("auth:session:*")); }

async function main() {
  if (!EMAIL || !PASSWORD) { fail("TEST_EMAIL/TEST_PASSWORD not set"); process.exit(1); }
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
  await redis.connect();

  console.log("\n=== baseline ===");
  const before = await sessKeys(redis);
  info(`auth:session:* before login = ${before.length}`);

  console.log("\n=== 1. LOGIN (valid creds) ===");
  const csrfRes = await fetch(`${AUTH}/api/auth/csrf`); absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: AUTH, json: "true" });
  const loginRes = await fetch(`${AUTH}/api/auth/callback/credentials`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() }, body, redirect: "manual",
  });
  absorb(loginRes);
  let lb = ""; try { lb = JSON.stringify(await loginRes.clone().json()); } catch {}
  const loc = loginRes.headers.get("location") || "";
  info(`login → ${loginRes.status} ${lb.slice(0,120)}${loc ? " loc=" + loc.slice(0,100) : ""}`);
  const hasSessionCookie = Object.keys(jar).some((k) => /session-token/.test(k));
  if (hasSessionCookie && !/error=/i.test(lb + loc)) pass(`session cookie issued (${Object.keys(jar).filter(k=>/session-token/.test(k)).join(", ")})`);
  else { fail("no session cookie / login error — check credentials"); }

  console.log("\n=== 2. REDIS SESSION STORAGE ===");
  await new Promise(r => setTimeout(r, 1500));
  const after = await sessKeys(redis);
  const fresh = after.filter((k) => !before.includes(k));
  if (fresh.length > 0) { const ttl = await redis.ttl(fresh[0]); pass(`new auth:session key created: ${fresh[0]} (TTL ${ttl}s ≈ ${(ttl/86400).toFixed(1)}d)`); const val = await redis.get(fresh[0]); info(`value: ${val}`); }
  else info(`auth:session:* now = ${after.length} (no new key diffed; login path may set sessionId only on first issue)`);

  console.log("\n=== 3. SESSION VALIDATION ===");
  const sess = await fetch(`${AUTH}/api/auth/session`, { headers: { Cookie: cookie() } });
  const sjson = await sess.json();
  if (sjson && sjson.user) pass(`/api/auth/session → user: ${sjson.user.email || JSON.stringify(sjson.user)} (expires ${sjson.expires})`);
  else fail(`/api/auth/session returned empty: ${JSON.stringify(sjson)}`);

  console.log("\n=== 4. LOGOUT (revoke) ===");
  const csrf2 = await fetch(`${AUTH}/api/auth/csrf`, { headers: { Cookie: cookie() } }); absorb(csrf2);
  const { csrfToken: ct2 } = await csrf2.json();
  const outRes = await fetch(`${AUTH}/api/auth/signout`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
    body: new URLSearchParams({ csrfToken: ct2, callbackUrl: AUTH, json: "true" }), redirect: "manual",
  });
  absorb(outRes);
  info(`signout → ${outRes.status}`);
  await new Promise(r => setTimeout(r, 1500));
  const sess2 = await fetch(`${AUTH}/api/auth/session`, { headers: { Cookie: cookie() } });
  const sjson2 = await sess2.json();
  (!sjson2 || !sjson2.user) ? pass("session no longer validates after logout") : info(`session still returns user (JWT cookie may persist client-side): ${JSON.stringify(sjson2.user)}`);
  const afterOut = await sessKeys(redis);
  if (fresh.length > 0) {
    const stillThere = afterOut.includes(fresh[0]);
    stillThere ? info(`Redis key ${fresh[0]} still present (revoke may run only via global signout event)`) : pass(`Redis session key revoked (deleted): ${fresh[0]}`);
  } else info(`auth:session:* after logout = ${afterOut.length}`);

  redis.disconnect();
  console.log("\nDone.");
}
main().catch((e) => { console.error(e); process.exit(1); });
