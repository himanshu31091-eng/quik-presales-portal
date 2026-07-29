const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Container build: emit a self-contained Node server under .next/standalone.
  // outputFileTracingRoot points at the monorepo root so workspace deps
  // (@quikit/*) are traced into the standalone bundle.
  output: "standalone",
  // Skip type/lint checks inside the Docker build — the pruned monorepo
  // tree may not include every devDep referenced by test/eslint configs
  // (e.g. @vitejs/plugin-react), and these checks already run in CI before
  // the docker build via separate `npm run typecheck` / `npm run lint`.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: [
    "@quikit/ui",
    "@quikit/auth",
    "@quikit/shared",
    "@quikit/database",
    "@quikit/redis",
  ],
  // Needed for apps/quikit/instrumentation.ts to run at server startup.
  // Wires up Sentry server/edge configs.
  experimental: {
    instrumentationHook: true,
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  async headers() {
    // Marketing is now served in-app (one zone). Its _next chunks + assets
    // are same-origin ('self'); only the forgot-password OTP calls remain
    // cross-origin to the dedicated auth service — allow that in
    // connect-src. Google Fonts (marketing typography) already covered.
    const AUTHO =
      process.env.NEXT_PUBLIC_AUTH_API_ORIGIN || "https://auth-quikit.vercel.app";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // cdn.jsdelivr.net is allowed for the Swagger UI bundle on /api/docs.
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com cdn.jsdelivr.net",
              "font-src 'self' fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              `connect-src 'self' https://*.sentry.io ${AUTHO}`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
