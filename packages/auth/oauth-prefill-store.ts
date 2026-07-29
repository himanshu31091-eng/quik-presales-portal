import { getRedis } from "@quikit/redis";

/**
 * OAuth pre-fill store.
 *
 * After a user signs in via Google / Microsoft, the provider's `given_name`
 * and `family_name` are stashed here keyed by `userId` with a 10-minute
 * TTL. The post-login profile-confirmation form reads them as the default
 * values for its inputs; the user can keep or edit and saves to the DB on
 * submit, at which point this store is cleared.
 *
 * We don't try to ferry the names through NextAuth's JWT — the encode /
 * decode preserves arbitrary fields in theory, but in practice we've seen
 * custom claims drop on the way out of `provider.profile()`, depending on
 * how the OAuth callback chain is configured. A 10-minute Redis key is a
 * simpler and more reliable contract: signIn writes, the form's GET reads,
 * the form's PATCH deletes.
 *
 * Falls back to a process-local Map when REDIS_URL isn't set — same
 * pattern as `apps/auth/lib/otp-store.ts`. Multi-instance prod requires
 * Redis (otherwise a different lambda from the one that wrote the key
 * may try to read it).
 */

const TTL_SECONDS = 600;
const key = (userId: string) => `oauth-prefill:${userId}`;

interface MemEntry {
  value: string;
  expiresAt: number;
}
const memStore = new Map<string, MemEntry>();

function memGet(k: string): string | null {
  const entry = memStore.get(k);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memStore.delete(k);
    return null;
  }
  return entry.value;
}

function memSet(k: string, value: string, ttlSeconds: number): void {
  memStore.set(k, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memDel(k: string): void {
  memStore.delete(k);
}

export interface OAuthPrefill {
  firstName: string;
  lastName: string;
}

/**
 * Persist a pre-fill suggestion for `userId`. Empty fields are still stored
 * so an explicit "Google has no surname for this account" signal is
 * preserved (rather than us silently omitting the call).
 */
export async function setOAuthPrefill(
  userId: string,
  prefill: OAuthPrefill,
): Promise<void> {
  const value = JSON.stringify(prefill);
  const r = getRedis();
  if (r) {
    try {
      await r.set(key(userId), value, "EX", TTL_SECONDS);
      return;
    } catch (err) {
      console.error("[oauth-prefill] redis set failed, falling back to memory:", err);
    }
  }
  memSet(key(userId), value, TTL_SECONDS);
}

export async function getOAuthPrefill(userId: string): Promise<OAuthPrefill | null> {
  const r = getRedis();
  let raw: string | null = null;
  if (r) {
    try {
      raw = await r.get(key(userId));
    } catch (err) {
      console.error("[oauth-prefill] redis get failed, falling back to memory:", err);
    }
  }
  if (raw === null) {
    raw = memGet(key(userId));
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthPrefill>;
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : "",
    };
  } catch {
    return null;
  }
}

export async function clearOAuthPrefill(userId: string): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      await r.del(key(userId));
    } catch (err) {
      console.error("[oauth-prefill] redis del failed, falling back to memory:", err);
    }
  }
  memDel(key(userId));
}
