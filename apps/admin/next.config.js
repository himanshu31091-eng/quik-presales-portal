const path = require("path");

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
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database", "@quikit/redis"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3002", "localhost:3005"],
    },
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  async headers() {
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
              "font-src 'self' fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self'",
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
