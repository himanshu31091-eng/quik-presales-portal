import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { db } from "@quikit/database";
import { type NextAuthOptions } from "next-auth";
import { ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY["admin"];

/**
 * Context handed to an injected {@link CreateRequireAdminOptions.extraAdminCheck}.
 * Only reached after session + active-membership guards have already passed.
 */
export type AdminCheckContext = { userId: string; orgId: string };

export type CreateRequireAdminOptions = {
  /**
   * App-specific admin escape hatch, consulted ONLY when the legacy
   * `OrgMember.role` tier is below admin. Lets an app recognise admins it
   * tracks in its own schema (e.g. QuikScale's dynamic-RBAC v2
   * `UserAppRole` → `AppRole`) without teaching this shared package about
   * app-private tables. Returning `true` promotes the request to admin;
   * `false`/throw falls through to the normal 403. It never bypasses the
   * 401 / no-org / no-membership guards above it.
   */
  extraAdminCheck?: (ctx: AdminCheckContext) => Promise<boolean>;
};

export function createRequireAdmin(
  authOptions: NextAuthOptions,
  opts: CreateRequireAdminOptions = {},
) {
  return async function requireAdmin() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.warn("[auth:requireAdmin] Denied: no session");
      return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
    }

    const orgId = session.user.orgId;
    if (!orgId) {
      console.warn("[auth:requireAdmin] Denied: no orgId for user", session.user.id);
      return { error: NextResponse.json({ success: false, error: "No organisation selected" }, { status: 400 }) };
    }

    const membership = await db.orgMember.findFirst({
      where: { userId: session.user.id, orgId, status: "active" },
    });

    if (!membership) {
      console.warn("[auth:requireAdmin] Denied: no active membership", { userId: session.user.id, orgId });
      return { error: NextResponse.json({ success: false, error: "No active membership" }, { status: 403 }) };
    }

    const roleLevel = ROLE_HIERARCHY[membership.role] ?? 0;
    if (roleLevel < ADMIN_MIN_LEVEL) {
      if (opts.extraAdminCheck) {
        let extraOk = false;
        try {
          extraOk = await opts.extraAdminCheck({ userId: session.user.id, orgId });
        } catch (e) {
          console.warn("[auth:requireAdmin] extraAdminCheck threw", { userId: session.user.id, orgId, error: e });
        }
        if (extraOk) return { session, userId: session.user.id, orgId, membership };
      }
      console.warn("[auth:requireAdmin] Denied: insufficient role", { userId: session.user.id, role: membership.role });
      return { error: NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 }) };
    }

    return { session, userId: session.user.id, orgId, membership };
  };
}
