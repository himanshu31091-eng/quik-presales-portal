import type { NextRequest } from "next/server";
import { verifyJWT } from "./jwt";
import type { ActingAs } from "./types";

const ALLOWED_ACTING_AS: ReadonlySet<ActingAs> = new Set([
  "user",
  "ai_agent",
  "platform_service",
  "scheduled_job",
]);

export interface AuthContext {
  userId: string;
  /** Active tenant/org id from JWT — isolation key for tenant-scoped queries. */
  orgId: string;
  orgRole: string;
  permissions: string[];
  isSuperAdmin: boolean;
  email: string | null;
  /**
   * Who/what is acting on this request. `'user'` for normal session JWTs.
   * Non-`'user'` only when the JWT was minted by the agent issuance endpoint.
   * Audit log code should record this as the actor type.
   */
  actingAs: ActingAs;
  /** Set when `actingAs === 'ai_agent'`. Null otherwise. */
  actingAgentId: string | null;
}

export async function withAuth(req: NextRequest): Promise<AuthContext> {
  const token = await verifyJWT(req);
  if (!token?.id) {
    throw new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const orgId = token.orgId as string | undefined;
  if (!orgId) {
    throw new Response(
      JSON.stringify({ success: false, error: "No organization selected" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }
  // Defensive read: defaults to 'user' if the claim is absent (legacy tokens)
  // or if a malformed value somehow slipped through.
  const rawActingAs = token.actingAs as ActingAs | undefined;
  const actingAs: ActingAs =
    rawActingAs && ALLOWED_ACTING_AS.has(rawActingAs) ? rawActingAs : "user";
  return {
    userId: token.id as string,
    orgId,
    orgRole: (token.membershipRole as string | undefined) ?? "member",
    permissions: (token as unknown as { permissions?: string[] }).permissions ?? [],
    isSuperAdmin: Boolean(token.isSuperAdmin),
    email: (token.email as string | undefined) ?? null,
    actingAs,
    actingAgentId: (token.actingAgentId as string | undefined) ?? null,
  };
}

export async function withAuthOptional(req: NextRequest): Promise<AuthContext | null> {
  try {
    return await withAuth(req);
  } catch {
    return null;
  }
}
