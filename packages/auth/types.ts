import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      /** Given name. Populated by createOAuthClientOptions session callback
       *  from the launcher hand-off JWE. Used by consumer-app headers. */
      firstName?: string;
      /** Family name. Mirrors firstName above. */
      lastName?: string;
      orgId?: string;
      membershipRole?: string;
      membershipInvalid?: boolean;
      isSuperAdmin?: boolean;
      /** Phase D: true while a super admin is viewing as another user. */
      impersonating?: boolean;
      /** Phase D: the super admin whose shadow session this is. */
      impersonatorUserId?: string;
      /** Phase D: display name of the impersonator (for the banner). */
      impersonatorEmail?: string;
      /** Phase D: hard expiry of the impersonation. Session should reject past this. */
      impersonationExpiresAt?: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
    isSuperAdmin?: boolean;
  }
}

/**
 * Closed enum for the `actingAs` claim. `'user'` is the default for any
 * normal session JWT (set by NextAuth credentials/OAuth callbacks).
 * Non-`'user'` values are minted only by `POST /api/auth/internal/issue-agent-jwt`.
 */
export type ActingAs = "user" | "ai_agent" | "platform_service" | "scheduled_job";

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    orgId?: string;
    membershipRole?: string;
    membershipCheckedAt?: number;
    membershipInvalid?: boolean;
    isSuperAdmin?: boolean;
    sessionId?: string;
    sessionTouchedAt?: number;
    /** Last time we verified `sessionId` is still active in Redis. Throttles
     *  the per-request liveness check so we hit Redis at most once per
     *  SESSION_CHECK_INTERVAL ms per token. */
    sessionCheckedAt?: number;
    impersonating?: boolean;
    impersonatorUserId?: string;
    impersonatorEmail?: string;
    impersonationExpiresAt?: string;
    /**
     * Identifies the principal "behind" the token. Absent on legacy tokens —
     * `withAuth` defaults to `'user'`. Set to a non-`'user'` value only by
     * the agent JWT issuance endpoint.
     */
    actingAs?: ActingAs;
    /** Set when `actingAs === 'ai_agent'`. Null on user sessions. */
    actingAgentId?: string;
    /**
     * OAuth pre-fill: provider-supplied first/last name carried on the JWT
     * for the post-login profile step to use. Only populated on the first
     * JWT issued after a Google/Azure sign-in; once the user fills the
     * /api/auth/me/profile PATCH, the stored DB value takes over.
     */
    oauthFirstName?: string;
    oauthLastName?: string;
  }
}
