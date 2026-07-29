import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { type NextAuthOptions } from "next-auth";

export function createRequireSuperAdmin(authOptions: NextAuthOptions) {
  return async function requireSuperAdmin() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.warn("[auth:requireSuperAdmin] Denied: no session");
      return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
    }

    if (!session.user.isSuperAdmin) {
      console.warn("[auth:requireSuperAdmin] Denied: not super admin", { userId: session.user.id });
      return { error: NextResponse.json({ success: false, error: "Super admin access required" }, { status: 403 }) };
    }

    return { session, userId: session.user.id };
  };
}
