import jwt from "jsonwebtoken";

export interface HandshakeIdentity {
  userId: string;
  orgId: string;
}

/**
 * Verify the short-lived handshake JWT minted by the app's
 * `GET /api/realtime/token`. Throws on missing/invalid/expired tokens.
 */
export function verifyToken(token: string, secret: string): HandshakeIdentity {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token payload");
  }
  const { userId, orgId } = decoded as Record<string, unknown>;
  if (typeof userId !== "string" || typeof orgId !== "string") {
    throw new Error("Token missing userId/orgId");
  }
  return { userId, orgId };
}
