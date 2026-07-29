/**
 * API guard: requires the caller to be a super admin.
 * Uses the JWT session flag first (populated at sign-in and refreshed in the
 * JWT callback), with a DB fallback only when the session flag is absent.
 * This avoids a DB query on every single API call while still being secure —
 * the JWT callback re-validates isSuperAdmin periodically.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function requireSuperAdmin(): Promise<
  { userId: string } | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }

  // Fast path: trust the JWT-cached flag (set at sign-in and refreshed every 5 min)
  if (session.user.isSuperAdmin === true) {
    return { userId: session.user.id };
  }

  // Fallback: DB check (covers edge case where JWT hasn't been refreshed yet)
  if (session.user.isSuperAdmin === undefined) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isSuperAdmin: true },
    });
    if (user?.isSuperAdmin) {
      return { userId: session.user.id };
    }
  }

  console.warn("[auth:requireSuperAdmin] Denied: not super admin", { userId: session.user.id });
  return { error: NextResponse.json({ success: false, error: "Super admin access required" }, { status: 403 }) };
}
