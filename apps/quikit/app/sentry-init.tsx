"use client";

import { useEffect } from "react";

/**
 * Mounts in the root layout so Sentry.init() runs once on first client render.
 * Skips loading the Sentry chunk entirely in dev (the static import otherwise
 * pulled @sentry/nextjs + @opentelemetry into every route compile).
 */
export function SentryInit() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    void import("../sentry.client.config");
  }, []);
  return null;
}
