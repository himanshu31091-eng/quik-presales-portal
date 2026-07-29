/**
 * Hot-read cache used by the auth chain (`getOrgId`, `getDisabledModules`,
 * `isTenantAppBlocked`).
 *
 * Layered:
 *   1. **In-memory LRU** — first stop. Per-process, instant. Always on.
 *   2. **Shared Redis** — second stop via `@quikit/redis`. Shared across
 *      serverless instances when REDIS_URL is configured.
 *
 * Cache strategy: short TTLs (15–60s) for everything membership/permission
 * shaped. The cost of a stale cache hit is "user has access for up to 60s
 * after admin revoked it" — acceptable for our threat model. The cost of
 * NOT caching is 4 DB hits per API call multiplied across every request.
 *
 * Note: `getOrSet` always falls open on cache failure (returns the loader's
 * fresh value) — a broken cache must not break auth.
 */

import { cacheDel, cacheGet, cacheSet, getRedis } from "@quikit/redis";

/* ─── Cross-process invalidation (pub/sub) ──────────────────────────────────
 *
 * The in-memory layer is per-process. Without pub/sub, when one Node process
 * calls `invalidate("tenantAppBlocked:abc")`, peer processes keep serving the
 * stale value from their local LRU until their own TTL elapses. That's how
 * "block app for tenant X" can stay invisible to half the pods for up to a
 * minute.
 *
 * Fix: on `invalidate(key)`, publish the key on a Redis channel. Every
 * process subscribes once at module load and drops its local copy on receipt.
 * The subscriber is lazy and fail-silent — a Redis outage simply degrades
 * back to per-process TTL behavior.
 */
const INVALIDATION_CHANNEL = "quikit:cache-invalidate";

let _subscriber: ReturnType<typeof getRedis> | null = null;
let _subscriberInitTried = false;

function ensureInvalidationSubscriber(): void {
  if (_subscriberInitTried) return;
  _subscriberInitTried = true;

  const main = getRedis();
  if (!main) return;

  try {
    // ioredis pub/sub requires a dedicated connection — `duplicate()` mirrors
    // the connection options without sharing the subscriber state.
    const sub = main.duplicate();
    _subscriber = sub;
    sub.on("error", () => {
      // Swallow — a broken subscriber must not break auth.
    });
    sub.subscribe(INVALIDATION_CHANNEL).catch(() => {
      // Best-effort subscribe; failure leaves this process on per-TTL eviction.
    });
    sub.on("message", (channel: string, key: string) => {
      if (channel === INVALIDATION_CHANNEL && key) {
        localStore.delete(key);
      }
    });
  } catch {
    // ioredis duplicate / subscribe failures fall back silently.
  }
}

async function publishInvalidation(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.publish(INVALIDATION_CHANNEL, key);
  } catch {
    // Best-effort — the local invalidate has already happened.
  }
}

interface CacheEntry<T> { value: T; expiresAt: number; }

const MAX_LOCAL_ENTRIES = 1000;
const localStore = new Map<string, CacheEntry<unknown>>();

function lruEvict() {
  if (localStore.size <= MAX_LOCAL_ENTRIES) return;
  // Drop the oldest entry (Map preserves insertion order).
  const firstKey = localStore.keys().next().value;
  if (firstKey !== undefined) localStore.delete(firstKey);
}

function localGet<T>(key: string): T | undefined {
  const e = localStore.get(key) as CacheEntry<T> | undefined;
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    localStore.delete(key);
    return undefined;
  }
  // Refresh insertion order so this key is considered "most recently used".
  localStore.delete(key);
  localStore.set(key, e);
  return e.value;
}

function localSet<T>(key: string, value: T, ttlSeconds: number) {
  localStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  lruEvict();
}

function localDelete(key: string) { localStore.delete(key); }

/* ─── Shared Redis adapter ──────────────────────────────────────────────────── */

async function redisGet<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await cacheGet(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function redisSet<T>(key: string, value: T, ttlSeconds: number) {
  try {
    await cacheSet(key, JSON.stringify(value), ttlSeconds);
  } catch {
    // Best-effort: cache writes never block.
  }
}

async function redisDelete(key: string) {
  try {
    await cacheDel(key);
  } catch {
    // Swallow
  }
}

/* ─── Public API ────────────────────────────────────────────────────────────── */

/**
 * Get-or-load with a layered cache. The loader runs on cache miss only —
 * its return value is written to both layers so the next call is hot.
 *
 * @param key  unique cache key (callers should prefix by domain to avoid clashes)
 * @param ttl  TTL in seconds; the in-memory store and Redis both honour it
 * @param loader function that produces the value when caches miss
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  // Lazily bind the cross-process invalidation listener on the first cache
  // touch. Doing it here (vs. at module load) keeps test envs that never
  // exercise the cache path from spinning up an unused Redis subscriber.
  ensureInvalidationSubscriber();

  // Layer 1: in-memory.
  const local = localGet<T>(key);
  if (local !== undefined) return local;

  // Layer 2: shared Redis.
  const remote = await redisGet<T>(key);
  if (remote !== undefined) {
    // Backfill the local layer so subsequent calls in this process skip the network.
    localSet(key, remote, ttlSeconds);
    return remote;
  }

  // Cache miss — load fresh.
  const fresh = await loader();
  localSet(key, fresh, ttlSeconds);
  // Fire-and-forget the upstream write; we already have the value.
  void redisSet(key, fresh, ttlSeconds);
  return fresh;
}

/** Manual invalidation — use after a mutation that changes cached state.
 *  Drops the local copy, deletes the Redis key, and publishes the key on
 *  the invalidation channel so peer processes evict their local copies too. */
export async function invalidate(key: string): Promise<void> {
  localDelete(key);
  await redisDelete(key);
  await publishInvalidation(key);
}

/** Test / dev helper — wipe the in-memory layer. */
export function _clearLocalCache() { localStore.clear(); }

export const isRedisCacheEnabled = () => Boolean(getRedis());
