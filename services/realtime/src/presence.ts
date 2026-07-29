/**
 * Redis-only presence (never persisted to Postgres). A user is "online" while at
 * least one of their sockets keeps a per-user socket SET alive; a TTL on the key
 * expires ghosts when a socket drops without a clean disconnect.
 */

/** Minimal ioredis pipeline shape used by `onlineUserIds` (§2.3). */
export interface PresencePipeline {
  exists(key: string): PresencePipeline;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

export interface PresenceRedis {
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  scard(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  del(key: string): Promise<number>;
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  exists(key: string): Promise<number>;
  pipeline(): PresencePipeline;
}

const key = (orgId: string, userId: string) => `presence:${orgId}:${userId}`;
const lastSeenKey = (orgId: string, userId: string) => `presence:lastseen:${orgId}:${userId}`;

/** Add a socket to the user's set. `firstSocket` ⇒ a 0→1 online transition. */
export async function markOnline(
  redis: PresenceRedis,
  orgId: string,
  userId: string,
  socketId: string,
  ttlMs: number,
): Promise<{ firstSocket: boolean }> {
  const k = key(orgId, userId);
  await redis.sadd(k, socketId);
  await redis.pexpire(k, ttlMs);
  const count = await redis.scard(k);
  return { firstSocket: count === 1 };
}

/** Remove a socket. `lastSocket` ⇒ a 1→0 offline transition (sets lastSeen). */
export async function markOffline(
  redis: PresenceRedis,
  orgId: string,
  userId: string,
  socketId: string,
): Promise<{ lastSocket: boolean; lastSeen?: string }> {
  const k = key(orgId, userId);
  await redis.srem(k, socketId);
  const count = await redis.scard(k);
  if (count > 0) return { lastSocket: false };
  await redis.del(k);
  const lastSeen = new Date().toISOString();
  await redis.set(lastSeenKey(orgId, userId), lastSeen);
  return { lastSocket: true, lastSeen };
}

/** Heartbeat: refresh the TTL so an active user doesn't expire. */
export async function refresh(
  redis: PresenceRedis,
  orgId: string,
  userId: string,
  ttlMs: number,
): Promise<void> {
  await redis.pexpire(key(orgId, userId), ttlMs);
}

/**
 * Filter a candidate list to those currently online (key still present).
 *
 * §2.3 hardening: the standalone gateway awaited one `EXISTS` per candidate
 * (N round-trips). This pipelines all EXISTS into a single round-trip.
 */
export async function onlineUserIds(
  redis: PresenceRedis,
  orgId: string,
  candidates: string[],
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const pipe = redis.pipeline();
  for (const userId of candidates) pipe.exists(key(orgId, userId));
  const results = (await pipe.exec()) ?? [];
  const out: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const entry = results[i];
    // entry === [err, value]; treat any positive EXISTS as online.
    const value = entry ? entry[1] : 0;
    if (Number(value) > 0) out.push(candidates[i]!);
  }
  return out;
}
