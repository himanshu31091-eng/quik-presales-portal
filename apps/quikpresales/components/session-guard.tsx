"use client";

import { createSessionGuard } from "@quikit/auth/session-guard";

/**
 * Client-side watchdog for access revoked after sign-in. Thin wrapper around
 * the shared factory — same shape as quikscale / quikinfra / quiktrack.
 */
export const SessionGuard = createSessionGuard({
  validateEndpoint: "/api/session/validate",
  loginRoute: "/login",
});
