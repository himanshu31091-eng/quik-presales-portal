import { getToken, type JWT } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { isAuthSessionActive } from "./session-store";

/**
 * Read + validate the NextAuth JWT from a request. Returns `null` when the
 * token is absent or the signature / expiry check fails. Apps that share
 * `NEXTAUTH_SECRET` with the central auth service trust the same JWT.
 */
export async function verifyJWT(req: NextRequest): Promise<JWT | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return null;

  const sessionId = (token.sessionId as string | undefined) ?? undefined;
  if (!sessionId) return token;

  const active = await isAuthSessionActive(sessionId);
  return active ? token : null;
}

/** Decode-only helper for contexts where you have a raw JWT string. */
export async function decodeJWT(token: string): Promise<JWT | null> {
  const mod = await import("next-auth/jwt");
  try {
    return (await mod.decode({ token, secret: process.env.NEXTAUTH_SECRET! })) ?? null;
  } catch {
    return null;
  }
}

export type { JWT } from "next-auth/jwt";
