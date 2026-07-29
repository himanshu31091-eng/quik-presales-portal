/**
 * @quikit/redis — shared Redis client for the QuikIT monorepo.
 *
 * Provides:
 *   - `redis` — singleton ioredis client (lazy-connects on first use)
 *   - `getRedis()` — returns the client or null if REDIS_URL is unset
 *   - `isRedisAvailable()` — checks if Redis is configured and responding
 *
 * Every consumer (rate limiter, session store, cache) uses `getRedis()`
 * and falls back to in-memory when it returns null. This means the app
 * works identically in dev (no Redis) and production (with Redis) — the
 * only difference is durability and multi-instance coordination.
 *
 * Environment variable:
 *   REDIS_URL — e.g. "redis://localhost:6379" or "rediss://user:pass@host:6380"
 *   If unset, all Redis operations gracefully degrade.
 */

import Redis from "ioredis";

let _client: Redis | null = null;
let _loggedMissingUrlInProd = false;
let _loggedConnectionErrorInProd = false;

/**
 * Log once per process (in production only) that Redis is missing or broken.
 * We deliberately do NOT spam every request — once is enough to notice in
 * Vercel function logs. Dev/test stays quiet.
 */
function logLoudlyInProd(kind: "missing-url" | "connection-error", detail?: string): void {
  if (process.env.NODE_ENV !== "production") return;

  if (kind === "missing-url") {
    if (_loggedMissingUrlInProd) return;
    _loggedMissingUrlInProd = true;
    console.error(
      "[redis] CRITICAL: REDIS_URL is not set in production. " +
        "Rate limiting, caching, and distributed session features will silently degrade to in-memory-per-instance. " +
        "This WILL cause correctness issues under load. Set REDIS_URL in your Vercel environment variables.",
    );
  } else if (kind === "connection-error") {
    if (_loggedConnectionErrorInProd) return;
    _loggedConnectionErrorInProd = true;
    console.error(
      `[redis] CRITICAL: first connection error in production. Redis may be down, misconfigured, or firewalled. ` +
        `Detail: ${detail ?? "unknown"}. Subsequent errors will be suppressed to avoid log spam.`,
    );
  }
}

/**
 * Get the singleton Redis client. Returns `null` if `REDIS_URL` is not set.
 * The client lazy-connects on the first command — no connection is opened
 * at import time.
 *
 * In production, missing `REDIS_URL` emits a loud one-time `console.error`
 * banner so the issue is visible in Vercel function logs (previously silent).
 */
export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    logLoudlyInProd("missing-url");
    return null;
  }

  if (!_client) {
    _client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        // Exponential backoff capped at 3 seconds
        return Math.min(times * 200, 3000);
      },
      lazyConnect: true,
      // Reconnect automatically on disconnect
      reconnectOnError(err) {
        const targetErrors = ["READONLY", "ECONNRESET", "ECONNREFUSED"];
        return targetErrors.some((t) => err.message.includes(t));
      },
    });

    _client.on("error", (err) => {
      // Loud first-error banner in prod; silent subsequent errors so we don't
      // spam logs on a long outage. Dev stays quiet.
      logLoudlyInProd("connection-error", err.message);
      // Keep the lower-severity log for non-prod visibility.
      if (process.env.NODE_ENV !== "production") {
        console.error("[redis] connection error:", err.message);
      }
    });
  }

  return _client;
}

/**
 * Require Redis to be available, or throw. Use ONLY in code paths where a
 * silent fallback is worse than an error (e.g. distributed locking, auth
 * rate-limiters where in-memory fallback would be trivially bypassable).
 *
 * In development (no REDIS_URL), this still throws — use the optional
 * `getRedis()` plus in-memory fallback for non-critical paths instead.
 */
export function requireRedis(): Redis {
  const client = getRedis();
  if (!client) {
    throw new Error(
      "Redis is required for this operation but REDIS_URL is not set. " +
        "Configure REDIS_URL in your environment.",
    );
  }
  return client;
}

/**
 * Check if Redis is configured AND responding.
 * Returns false if REDIS_URL is unset or if PING fails.
 */
export async function isRedisAvailable(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    const pong = await client.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/**
 * Gracefully close the Redis connection (for shutdown hooks).
 */
export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}

/**
 * Simple cache helpers — get/set with TTL.
 * Returns null on miss or if Redis is unavailable.
 */
export async function cacheGet(key: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, value, "EX", ttlSeconds);
  } catch {
    // Swallow — cache is best-effort
  }
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch {
    // Swallow
  }
}
