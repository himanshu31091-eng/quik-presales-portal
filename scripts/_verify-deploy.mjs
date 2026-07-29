#!/usr/bin/env node
// Verify the deployed Auth + QuikIT against Neon (DB) and Redis Cloud.
// Read-only / non-destructive: no users created, no data mutated.
//
//   node scripts/_verify-deploy.mjs

import Redis from "ioredis";

const AUTH = "https://auth-alpha-hazel.vercel.app";
const QUIKIT = "https://quikit-silk.vercel.app";
const REDIS_URL = "redis://default:uhK92dZqKGdEPLLj9Mp2xb0Mxgn4dVMW@redis-18008.c264.ap-south-1-1.ec2.cloud.redislabs.com:18008";

const pass = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`  •  ${m}`);

function parseCookies(res) {
  const out = {};
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) { const [kv] = c.split(";"); const i = kv.indexOf("="); out[kv.slice(0, i)] = kv.slice(i + 1); }
  return out;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function main() {
  console.log("\n=== 1. Liveness / serving ===");
  for (const [name, base, path] of [["auth", AUTH, "/api/health"], ["auth", AUTH, "/login"], ["quikit", QUIKIT, "/api/health"], ["quikit", QUIKIT, "/"]]) {
    const r = await fetch(base + path, { redirect: "manual" });
    (r.status >= 200 && r.status < 400 ? pass : fail)(`${name} ${path} → ${r.status}`);
  }

  console.log("\n=== 2. Auth ↔ QuikIT redirect flow (unauthenticated) ===");
  for (const path of ["/apps", "/select-org", "/"]) {
    const r = await fetch(QUIKIT + path, { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    if (r.status >= 300 && r.status < 400 && /\/login|auth/i.test(loc)) {
      pass(`quikit ${path} → ${r.status} → ${loc.slice(0, 90)}`);
    } else {
      info(`quikit ${path} → ${r.status}${loc ? " → " + loc.slice(0, 90) : " (no redirect; likely public)"}`);
    }
  }

  console.log("\n=== 3. Neon DB connectivity (via deployed Auth credentials path) ===");
  // Well-formed bogus login. authorize() runs db.user.findFirst → if the DB is
  // reachable, user is not found → CredentialsSignin. A DB outage would 500.
  const csrfRes = await fetch(`${AUTH}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const jar = parseCookies(csrfRes);
  info(`got csrfToken (${csrfToken ? "ok" : "MISSING"}), cookies: ${Object.keys(jar).join(", ")}`);
  const body = new URLSearchParams({ csrfToken, email: `probe-${Date.now()}@noexist.example`, password: "definitely-wrong", callbackUrl: AUTH, json: "true" });
  const loginRes = await fetch(`${AUTH}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
    body, redirect: "manual",
  });
  const loc = loginRes.headers.get("location") || "";
  let jbody = ""; try { jbody = JSON.stringify(await loginRes.clone().json()); } catch { jbody = ""; }
  info(`login(bad creds) → ${loginRes.status}  loc=${loc.slice(0, 110)} ${jbody.slice(0,110)}`);
  if (loginRes.status === 500 || /error=Configuration|CallbackRouteError/i.test(loc + jbody)) {
    fail("DB path returned a server/config error — DB may be unreachable");
  } else if (/CredentialsSignin|error=/i.test(loc + jbody) || loginRes.status === 401) {
    pass("DB reachable: authorize() queried users and rejected bad creds (CredentialsSignin)");
  } else {
    info("Unexpected response — inspect manually");
  }

  console.log("\n=== 4. Redis usage by deployed app (forgot-password rate-limiter writes rl:*) ===");
  for (let i = 0; i < 4; i++) {
    await fetch(`${AUTH}/api/auth/forgot-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "probe-rl@noexist.example" }),
    }).catch(() => {});
  }
  info("sent 4 forgot-password requests");

  console.log("\n=== 5. Direct Redis inspection (same instance the app uses) ===");
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
  try {
    await redis.connect();
    const pong = await redis.ping();
    (pong === "PONG" ? pass : fail)(`PING → ${pong}`);
    const dbsize = await redis.dbsize();
    info(`DBSIZE = ${dbsize} keys`);
    const rl = await redis.keys("rl:*");
    (rl.length > 0 ? pass : info)(`rl:* keys = ${rl.length}` + (rl.length ? ` (deployed app IS writing to Redis) e.g. ${rl[0]}` : " (none seen — rate-limiter path may not have triggered)"));
    const sess = await redis.keys("auth:session:*");
    info(`auth:session:* keys = ${sess.length}` + (sess.length ? ` e.g. ${sess[0]} (ttl ${await redis.ttl(sess[0])}s)` : " (none yet — created on successful login)"));
    const sample = (await redis.keys("*")).slice(0, 10);
    info(`sample keys: ${sample.join(", ") || "(empty)"}`);
    const server = (await redis.info("server")).split("\n").find((l) => l.startsWith("redis_version"));
    info(server?.trim() || "");
  } catch (e) {
    fail(`Redis error: ${e.message}`);
  } finally {
    redis.disconnect();
  }
  console.log("\nDone.");
}
main().catch((e) => { console.error(e); process.exit(1); });
