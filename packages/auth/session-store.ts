import { randomUUID } from "crypto";
import { getRedis } from "@quikit/redis";

const SESSION_PREFIX = "auth:session";

function buildSessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}:${sessionId}`;
}

/**
 * Create a Redis-backed auth session id used to soft-invalidate JWTs.
 * Falls back to a local random id when Redis is unavailable.
 */
export async function createAuthSession(
  userId: string,
  ttlSeconds: number,
): Promise<string> {
  const sessionId = randomUUID();
  const redis = getRedis();
  if (!redis) return sessionId;

  try {
    await redis.set(
      buildSessionKey(sessionId),
      JSON.stringify({ userId, createdAt: Date.now() }),
      "EX",
      ttlSeconds,
    );
  } catch {
    // Fail-open: login should still work if Redis is down.
  }

  return sessionId;
}

/**
 * Keep the Redis session key alive while JWT is active.
 * No-op when Redis is unavailable.
 */
export async function touchAuthSession(
  sessionId: string,
  ttlSeconds: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.expire(buildSessionKey(sessionId), ttlSeconds);
  } catch {
    // Best effort
  }
}

/**
 * Check if a session id still exists in Redis.
 * Fails open when Redis is unavailable or errors.
 */
export async function isAuthSessionActive(sessionId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const exists = await redis.exists(buildSessionKey(sessionId));
    return exists === 1;
  } catch {
    return true;
  }
}

/**
 * Revoke a Redis-backed session id.
 * No-op when Redis is unavailable.
 */
export async function revokeAuthSession(sessionId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(buildSessionKey(sessionId));
  } catch {
    // Best effort
  }
}
