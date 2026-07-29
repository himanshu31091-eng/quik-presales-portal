/**
 * Sentry server-side configuration.
 *
 * Runs on the Node.js server (API routes, SSR, middleware).
 * Captures unhandled exceptions, promise rejections, and traces from
 * database queries, OAuth endpoints, and super-admin handlers.
 *
 * DSN is loaded from SENTRY_DSN (server env, NOT public).
 * If unset, Sentry silently no-ops.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  enabled: process.env.NODE_ENV !== "development",

  environment: process.env.NODE_ENV ?? "development",
});
