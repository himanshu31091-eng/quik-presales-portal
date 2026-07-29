/**
 * Sentry client-side configuration.
 *
 * Captures unhandled JS errors, promise rejections, and (optionally)
 * performance traces from React renders in the launcher + super admin UI.
 *
 * DSN is loaded from NEXT_PUBLIC_SENTRY_DSN. If unset, Sentry silently
 * no-ops — the app runs identically without it.
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",

  // Performance: sample 10% of transactions in production, 100% in dev/preview
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay: disabled by default (heavy)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Only send errors in non-dev environments
  enabled: process.env.NODE_ENV !== "development",

  environment: process.env.NODE_ENV ?? "development",
});
