/**
 * Sentry edge runtime configuration (middleware, edge API routes).
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: process.env.NODE_ENV !== "development",
  environment: process.env.NODE_ENV ?? "development",
});
