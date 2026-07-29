"use client";

import { createSessionGuard } from "@quikit/auth/session-guard";

/**
 * Mirrors apps/admin/components/session-guard.tsx.
 * Uses the shared session-guard from @quikit/auth — same pattern as apps/admin.
 */
export const SessionGuard = createSessionGuard({
  validateEndpoint: "/api/session/validate",
  loginRoute: "/login",
});

export default SessionGuard;
