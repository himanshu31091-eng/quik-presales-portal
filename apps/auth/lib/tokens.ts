import crypto from "node:crypto";

/**
 * Generate an unguessable URL-safe random token (256 bits of entropy) and
 * return both the raw token (sent to the user) and its SHA-256 hash
 * (stored in the DB). We never store the raw token at rest.
 */
export function generateToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = hashToken(token);
  return { token, hash };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
