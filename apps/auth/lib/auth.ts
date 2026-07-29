import { createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * Central auth options for auth.quikit.ai.
 *
 * NEXTAUTH_SECRET MUST match across every app (auth, admin, quikit, quikscale, etc.)
 * otherwise JWTs issued here will be rejected by the other apps.
 */
export const authOptions = createAuthOptions({
  signInPage: "/login",
  errorPage: "/login",
});
