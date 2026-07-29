const path = require("path");
const fs = require("fs");

/**
 * Parse KEY=VALUE lines (minimal .env) and optionally only set missing env vars.
 * Ensures `DATABASE_URL` exists for `@quikit/database` when `apps/auth/.env.local`
 * was never created — common in this monorepo because DB vars live under `quikit`.
 */
function parseEnvLines(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function applyEnvFile(filePath, mode) {
  if (!fs.existsSync(filePath)) return;
  const vars = parseEnvLines(fs.readFileSync(filePath, "utf8"));
  for (const [key, val] of Object.entries(vars)) {
    if (mode === "fill" && process.env[key] !== undefined) continue;
    process.env[key] = val;
  }
}

const authRoot = __dirname;
// Shared DB / Redis: fill only undefined keys
applyEnvFile(path.join(authRoot, "../../.env.local"), "fill");
applyEnvFile(path.join(authRoot, "../../.env"), "fill");
applyEnvFile(path.join(authRoot, "../quikit/.env.local"), "fill");
applyEnvFile(path.join(authRoot, "../quikit/.env"), "fill");
applyEnvFile(path.join(authRoot, "../admin/.env.local"), "fill");
// Auth-specific overrides (NEXTAUTH_URL on :3004, etc.)
applyEnvFile(path.join(authRoot, ".env.local"), "overwrite");
applyEnvFile(path.join(authRoot, ".env"), "overwrite");

// Central auth dev uses `-p 3004`. If we only inherited env from `quikit`,
// NEXTAUTH_URL may still be the launcher (:3000). This localhost fallback is a
// DEV-ONLY convenience: in production the runtime env (k8s ConfigMap/Secret)
// is the source of truth, and force-setting localhost here would clobber the
// injected public origin — leaving redirects to fall back to the pod bind
// address (the `0.0.0.0:3001` login-redirect bug). Never run it in prod.
if (process.env.NODE_ENV !== "production") {
  const authOwnEnv =
    fs.existsSync(path.join(authRoot, ".env.local")) ||
    fs.existsSync(path.join(authRoot, ".env"));
  if (!authOwnEnv) {
    process.env.NEXTAUTH_URL = "http://localhost:3004";
    process.env.NEXT_PUBLIC_AUTH_URL = "http://localhost:3004";
  } else {
    if (!process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = "http://localhost:3004";
    if (!process.env.NEXT_PUBLIC_AUTH_URL) {
      process.env.NEXT_PUBLIC_AUTH_URL = process.env.NEXTAUTH_URL;
    }
  }
}
// Prisma migrate uses directUrl; runtime queries only need DATABASE_URL, but mirror if missing
if (process.env.DATABASE_URL && !process.env.DATABASE_URL_DIRECT) {
  process.env.DATABASE_URL_DIRECT = process.env.DATABASE_URL;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Container build: emit a self-contained Node server under .next/standalone.
  // outputFileTracingRoot points at the monorepo root so workspace deps
  // (@quikit/*) are traced into the standalone bundle.
  output: "standalone",
  // Skip type/lint checks inside the Docker build — the pruned monorepo
  // tree may not include every devDep; these checks already run in CI.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: [
    "@quikit/ui",
    "@quikit/auth",
    "@quikit/shared",
    "@quikit/database",
    "@quikit/redis",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
