// Login via handoff, then read /api/apps/launcher and print each app's resolved baseUrl.
const AUTH = "https://auth-pravin-sharmas-projects-cb2dd481.vercel.app";
const QUIKIT = "https://quikit-pravin-sharmas-projects-cb2dd481.vercel.app";
const EMAIL = process.env.TEST_EMAIL, PASSWORD = process.env.TEST_PASSWORD;
const ajar = {}, qjar = {};
const ab = (j, r) => { for (const c of (r.headers.getSetCookie?.() || [])) { const [kv] = c.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v && v !== "deleted") j[k] = v; else delete j[k]; } };
const ck = (j) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
(async () => {
  const csrf = await fetch(`${AUTH}/api/auth/csrf`); ab(ajar, csrf);
  const { csrfToken } = await csrf.json();
  ab(ajar, await fetch(`${AUTH}/api/auth/callback/credentials`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ck(ajar) }, body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: AUTH, json: "true" }), redirect: "manual" }));
  const pl = await fetch(`${AUTH}/api/post-login?callbackUrl=${encodeURIComponent(QUIKIT + "/apps")}`, { headers: { Cookie: ck(ajar) }, redirect: "manual" });
  ab(qjar, await fetch(pl.headers.get("location"), { redirect: "manual" }));
  const res = await fetch(`${QUIKIT}/api/apps/launcher`, { headers: { Cookie: ck(qjar) } });
  const j = await res.json();
  console.log("status", res.status);
  for (const app of (j.data || j.apps || [])) {
    const flag = /localhost/.test(app.baseUrl || "") ? "❌ LOCALHOST" : "✅";
    console.log(`  ${flag}  ${app.slug.padEnd(11)} → ${app.baseUrl}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
