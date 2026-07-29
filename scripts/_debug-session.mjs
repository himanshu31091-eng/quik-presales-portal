// Decode the QuikIT session cookie minted via the handoff to see real claims.
import { decode } from "next-auth/jwt";
import Redis from "ioredis";

const AUTH = "https://auth-pravin-sharmas-projects-cb2dd481.vercel.app";
const QUIKIT = "https://quikit-pravin-sharmas-projects-cb2dd481.vercel.app";
const SECRET = "7ynQaE7hcVrogq9q7OdIQTnCaeg+uPLeqXELLAWQ7LE=";
const REDIS_URL = "redis://default:uhK92dZqKGdEPLLj9Mp2xb0Mxgn4dVMW@redis-18008.c264.ap-south-1-1.ec2.cloud.redislabs.com:18008";
const EMAIL = process.env.TEST_EMAIL, PASSWORD = process.env.TEST_PASSWORD;

const jar = {};
const absorb = (r) => { for (const c of (r.headers.getSetCookie?.() || [])) { const [kv] = c.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v && v !== "deleted") jar[k] = v; else delete jar[k]; } };
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

(async () => {
  const csrf = await fetch(`${AUTH}/api/auth/csrf`); absorb(csrf);
  const { csrfToken } = await csrf.json();
  const login = await fetch(`${AUTH}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ck() }, body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: AUTH, json: "true" }), redirect: "manual" });
  absorb(login);
  const pl = await fetch(`${AUTH}/api/post-login?callbackUrl=${encodeURIComponent(QUIKIT + "/apps")}`, { headers: { Cookie: ck() }, redirect: "manual" });
  const handoffUrl = pl.headers.get("location");
  console.log("handoff:", handoffUrl?.slice(0, 80));

  // capture quikit session cookie from the handoff response
  const qjar = {};
  const ho = await fetch(handoffUrl, { redirect: "manual" });
  for (const c of (ho.headers.getSetCookie?.() || [])) { const [kv] = c.split(";"); const i = kv.indexOf("="); qjar[kv.slice(0, i)] = kv.slice(i + 1); }
  const cookieName = Object.keys(qjar).find((k) => /session-token/.test(k));
  const raw = qjar[cookieName];
  console.log("quikit session cookie:", cookieName, raw ? `(${raw.length} chars)` : "MISSING");

  // decode it with NEXTAUTH_SECRET
  const claims = await decode({ token: raw, secret: SECRET });
  console.log("\n=== decoded QuikIT session-cookie claims ===");
  console.log(JSON.stringify(claims, null, 2));

  // is the sessionId active in Redis?
  if (claims?.sessionId) {
    const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
    await redis.connect();
    const exists = await redis.exists(`auth:session:${claims.sessionId}`);
    console.log(`\nauth:session:${claims.sessionId} in Redis: ${exists === 1 ? "ACTIVE" : "MISSING"}`);
    redis.disconnect();
  } else {
    console.log("\n(no sessionId claim in cookie)");
  }
})().catch((e) => { console.error(e); process.exit(1); });
