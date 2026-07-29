import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Resolve the signed-in user id for App Router route handlers.
 * Prefer this over `getServerSession` here — NextAuth's session helper can miss
 * cookies / JWT claims on non-[...nextauth] routes and yield flaky 401/500s.
 */
export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const token = await getToken({ req, secret });
  if (!token) return null;

  const id = (token.sub ?? token.id) as unknown;
  return typeof id === "string" && id.length > 0 ? id : null;
}
