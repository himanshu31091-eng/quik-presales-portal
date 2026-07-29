/**
 * Simple Redis-backed cache helper for GET-shaped API responses.
 *
 * Usage:
 *
 *   const data = await cacheOrCompute(
 *     `super:analytics:overview`,
 *     60, // TTL seconds
 *     async () => heavyComputation(),
 *   );
 *
 * Falls back to invoking `compute` directly when Redis is unavailable or
 * when the cache is in fail-open mode (default). Never throws — cache
 * failures pass through transparently.
 *
 * This module imports `getRedis` from @quikit/redis and must only be used
 * in server-side code. Exported via the `@quikit/shared/redisCache`
 * subpath to keep it out of the client barrel.
 */

import { getRedis } from "@quikit/redis";

export interface CacheOptions {
  /** If true, log cache hits/misses to console (for debugging only). */
  debug?: boolean;
}

export async function cacheOrCompute<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const redis = getRedis();
  if (!redis) {
    // No Redis → always compute
    return compute();
  }

  try {
    const hit = await redis.get(key);
    if (typeof hit === "string" && hit.length > 0) {
      if (options.debug) console.log(`[cache] HIT ${key}`);
      try {
        return JSON.parse(hit) as T;
      } catch {
        // Corrupted cache entry — fall through and recompute
      }
    }
  } catch {
    // Redis error on read — fall through and recompute
  }

  const value = await compute();

  // Fire-and-forget write. If Redis is down we still return fresh data.
  // ioredis TTL form: set(key, value, "EX", seconds).
  (async () => {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      if (options.debug) console.log(`[cache] SET ${key} ttl=${ttlSeconds}`);
    } catch {
      // ignore
    }
  })();

  return value;
}

/**
 * Invalidate a specific cache key. Fire-and-forget.
 * Use after a mutation that invalidates derived analytics / aggregates.
 */
export async function invalidate(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // ignore
  }
}
