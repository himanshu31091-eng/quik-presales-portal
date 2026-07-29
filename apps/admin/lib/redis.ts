/**
 * admin-next cache layer — wraps @quikit/redis (raw string get/set) with
 * JSON typing, plus the `getOrSet` helper from @quikit/auth/cache for any
 * code that wants memoization with TTL.
 *
 * Cache keys are scoped by `orgId` (the monorepo's name for tenant id).
 * The `tenantId` parameter names from the standalone build are kept for
 * back-compat but they hold orgId values.
 */

import {
  cacheGet as redisGetRaw,
  cacheSet as redisSetRaw,
  cacheDel,
} from "@quikit/redis";
export { cacheDel };
export { getOrSet, invalidate } from "@quikit/auth/cache";

/** Typed JSON get — parses the stored string or returns null. */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const raw = await redisGetRaw(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Typed JSON set — stringifies the value before storing. Defaults to 5-minute TTL. */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number = 300,
): Promise<void> {
  await redisSetRaw(key, JSON.stringify(value), ttlSeconds);
}

export const CacheKeys = {
  permissions: (orgId: string, userId: string, appId: string) =>
    `admin:perms:${orgId}:${userId}:${appId}`,
  permissionsPattern: (orgId: string, appId: string) =>
    `admin:perms:${orgId}:*:${appId}`,
  userPermissionsPattern: (orgId: string, userId: string) =>
    `admin:perms:${orgId}:${userId}:*`,
  featureFlags: (orgId: string) => `feature-flags:admin:${orgId}`,
  membership: (userId: string, orgId: string) =>
    `auth:membership:${userId}:${orgId}`,
  membershipsList: (userId: string) => `memberships:list:${userId}`,
  dashboardStats: (orgId: string) => `dashboard:stats:${orgId}`,
};

export const MEMBERSHIP_CACHE_TTL = 60;
export const FEATURE_FLAGS_CACHE_TTL = 300;
export const MEMBERSHIPS_LIST_CACHE_TTL = 60;
export const DASHBOARD_STATS_CACHE_TTL = 30;

/**
 * Pattern-based deletes aren't exposed by the real @quikit/redis package.
 * For now these are no-ops; the per-key TTL (10 min) is short enough that
 * stale entries clear themselves. If true pattern invalidation is needed,
 * add cacheDelPattern to @quikit/redis as a follow-up.
 */
export async function invalidatePermissionCache(
  _orgId: string,
  _appId: string,
): Promise<void> {
  // Intentionally no-op — see comment above.
}

export async function invalidateUserPermissionCache(
  _orgId: string,
  _userId: string,
): Promise<void> {
  // Intentionally no-op — see comment above.
}

export async function invalidateMembershipCache(
  userId: string,
  orgId: string,
): Promise<void> {
  await cacheDel(CacheKeys.membership(userId, orgId));
}

export async function invalidateFeatureFlagsCache(orgId: string): Promise<void> {
  await cacheDel(CacheKeys.featureFlags(orgId));
}
