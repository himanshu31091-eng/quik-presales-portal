/**
 * Shared fixed-window rate limiter for the QuikIT monorepo.
 *
 * Moved from apps/quikscale/lib/api/rateLimit.ts as part of P0-3
 * (docs/plans/P0-3-distributed-rate-limiter.md). The quikscale file
 * now re-exports from here for compatibility.
 *
 * Two call modes:
 *   - `rateLimit(opts)`     — synchronous, in-memory only. Fine for single-
 *                             process dev. NEVER use this in production
 *                             multi-instance deployments: counters are
 *                             per-process and trivially bypassable.
 *   - `rateLimitAsync(opts)` — uses Redis when REDIS_URL is set, in-memory
 *                             fallback otherwise. The correct default for
 *                             any production code path.
 *
 * Fail policy:
 *   - By default, when Redis is unavailable, both calls fall back to the
 *     in-memory limiter — i.e. fail-open. Fine for non-critical routes.
 *   - Callers guarding auth-like surfaces pass `failClosed: true` (via
 *     rateLimitAsync). When Redis is unreachable in that mode, the call
 *     returns `{ ok: false }` — we'd rather turn users away than let
 *     attackers through unthrottled.
 *
 * The algorithm is fixed-window per (routeKey, clientKey). Keys expire
 * automatically via Redis TTL (distributed) or lazy sweep (in-memory).
 */

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  /** Only set by rateLimitAsync — tells callers whether Redis answered. */
  redisAvailable?: boolean;
}

export interface RateLimitStore {
  hit(key: string, windowStart: number, ttlMs: number): number;
}

export interface RateLimitOptions {
  routeKey: string;
  clientKey: string;
  limit: number;
  windowMs: number;
  store?: RateLimitStore;
}

export interface AsyncRateLimitOptions extends Omit<RateLimitOptions, "store"> {
  /**
   * When true, treat an unavailable Redis as a block (fail-closed). Use for
   * auth endpoints. Defaults to false so non-auth callers keep working when
   * Redis hiccups.
   */
  failClosed?: boolean;
}

/* ─── In-memory store (dev / fallback) ────────────────────────────────── */

export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; expiresAt: number }>();
  private lastSweep = 0;

  hit(key: string, windowStart: number, ttlMs: number): number {
    const now = Date.now();
    this.maybeSweep(now);
    const bucketKey = `${key}:${windowStart}`;
    const existing = this.buckets.get(bucketKey);
    if (existing && existing.expiresAt > now) {
      existing.count += 1;
      return existing.count;
    }
    this.buckets.set(bucketKey, { count: 1, expiresAt: now + ttlMs });
    return 1;
  }

  /** Lazy cleanup every 60 s so the map does not grow unbounded. */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.buckets.entries()) {
      if (v.expiresAt <= now) this.buckets.delete(k);
    }
  }

  /** For tests. */
  reset(): void {
    this.buckets.clear();
    this.lastSweep = 0;
  }
}

const DEFAULT_STORE = new MemoryRateLimitStore();

/* ─── Sync API ────────────────────────────────────────────────────────── */

/**
 * Synchronous rate limit check. In-memory; single process only.
 * Prefer `rateLimitAsync` for production code.
 */
export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const { routeKey, clientKey, limit, windowMs, store = DEFAULT_STORE } = opts;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;

  const key = `${routeKey}|${clientKey}`;
  const count = store.hit(key, windowStart, windowMs);

  const remaining = Math.max(0, limit - count);
  const ok = count <= limit;
  const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - now) / 1000));

  return { ok, remaining, resetAt, retryAfterSeconds };
}

/* ─── Async API — Redis-backed ────────────────────────────────────────── */

import { getRedis } from "@quikit/redis";

/**
 * Async rate limit check. Uses Redis when REDIS_URL is set, falls back to
 * in-memory otherwise.
 *
 * With `failClosed: true`, treats "no Redis" as a block (returns `{ ok: false }`).
 * This is the right choice for auth endpoints: we'd rather reject a single
 * real user during a Redis outage than let an attacker bypass the limit.
 */
export async function rateLimitAsync(
  opts: AsyncRateLimitOptions,
): Promise<RateLimitResult> {
  const redis = getRedis();

  if (!redis) {
    if (opts.failClosed) {
      return {
        ok: false,
        remaining: 0,
        resetAt: Date.now() + opts.windowMs,
        retryAfterSeconds: Math.ceil(opts.windowMs / 1000),
        redisAvailable: false,
      };
    }
    return { ...rateLimit(opts), redisAvailable: false };
  }

  const { routeKey, clientKey, limit, windowMs } = opts;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const ttlSeconds = Math.ceil(windowMs / 1000);

  const redisKey = `rl:${routeKey}|${clientKey}:${windowStart}`;

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, ttlSeconds);
    }

    const remaining = Math.max(0, limit - count);
    const ok = count <= limit;
    const retryAfterSeconds = Math.max(0, Math.ceil((resetAt - now) / 1000));

    return { ok, remaining, resetAt, retryAfterSeconds, redisAvailable: true };
  } catch {
    if (opts.failClosed) {
      return {
        ok: false,
        remaining: 0,
        resetAt: Date.now() + opts.windowMs,
        retryAfterSeconds: Math.ceil(opts.windowMs / 1000),
        redisAvailable: false,
      };
    }
    return { ...rateLimit(opts), redisAvailable: false };
  }
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

/**
 * Best-effort client IP extractor for `Headers`-style request objects
 * (Next.js App Router route handlers use this shape).
 */
export function getClientIp(request: {
  headers: { get(name: string): string | null };
}): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xreal = request.headers.get("x-real-ip");
  if (xreal) return xreal.trim();
  return "anonymous";
}

/** Preset limits. Tune centrally so all apps share policy. */
export const LIMITS = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  kpiWrite: { limit: 30, windowMs: 60 * 1000 },
  mutation: { limit: 60, windowMs: 60 * 1000 },
} as const;

/** Reset the default in-memory store (test helper). */
export function _resetDefaultStore(): void {
  (DEFAULT_STORE as MemoryRateLimitStore).reset();
}
