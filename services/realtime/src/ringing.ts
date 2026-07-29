/**
 * §2.1 — Redis-backed ringing timeout (multi-instance safe).
 *
 * The standalone gateway held ringing timers in an in-process `Map` + per-call
 * `setTimeout`. That breaks across instances: instance A rings, instance B
 * accepts, A's timer still fires `call:timed_out`. Here the ringing state lives
 * in Redis so any instance can clear it, and a per-instance sweeper claims
 * expired records atomically so exactly one instance emits the timeout.
 *
 * Design notes (both load-bearing):
 *  1. `PX` is NOT the timer. The record carries `expiresAt` (Date.now()+30s) in
 *     its JSON payload; the key's TTL is only a long safety GC (90s) for records
 *     orphaned by a crash. If PX were the timer, (a) a ~5s sweep would never see
 *     a 30s deadline honoured — it'd fire at the first tick — and (b) the key
 *     would self-delete before the sweep could claim it, so nobody emits.
 *  2. The claim is `GETDEL` — atomic get-and-delete, so across N instances the
 *     record is handed to exactly one caller. Requires Redis 6.2+. On older
 *     Redis, replace the `getdel` call with the Lua fallback (atomic on the
 *     server):
 *       EVAL "local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]) end; return v" 1 <key>
 *
 * Firing granularity is the sweep interval (~5s), so a timeout fires 30–35s
 * after invite — acceptable per plan §2.1.
 */

export interface RingingRedis {
  set(key: string, value: string, mode: "PX", ms: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

export interface RingingRecord {
  callId: string;
  initiatorId: string;
  targetUserId: string;
  /** QcCall.channelId is nullable (a call needn't be tied to a channel). */
  channelId: string | null;
  orgId: string;
  /** Absolute epoch-ms deadline; the sweep fires once `now >= expiresAt`. */
  expiresAt: number;
}

export const RING_MS = 30_000;
/** Safety TTL: GC for records orphaned by a crashed instance. > RING_MS. */
export const SAFETY_TTL_MS = 90_000;
export const SWEEP_INTERVAL_MS = 5_000;

const INDEX_KEY = "ringing:index";
const recordKey = (callId: string) => `ringing:${callId}`;

/** Register a ringing record (call:invite). `now` is injectable for tests. */
export async function setRinging(
  redis: RingingRedis,
  rec: Omit<RingingRecord, "expiresAt">,
  now: number = Date.now(),
  ringMs: number = RING_MS,
): Promise<void> {
  const full: RingingRecord = { ...rec, expiresAt: now + ringMs };
  await redis.set(recordKey(rec.callId), JSON.stringify(full), "PX", SAFETY_TTL_MS);
  await redis.sadd(INDEX_KEY, rec.callId);
}

/** Clear a ringing record from any instance (accept/reject/cancel/end). */
export async function clearRinging(redis: RingingRedis, callId: string): Promise<void> {
  await redis.del(recordKey(callId));
  await redis.srem(INDEX_KEY, callId);
}

/**
 * Scan the index once; atomically claim + emit every record whose deadline has
 * passed. Returns the records this call actually claimed (for logging/tests).
 * Exactly-once across instances is guaranteed by the `GETDEL` claim.
 */
export async function sweepOnce(
  redis: RingingRedis,
  now: number,
  emit: (rec: RingingRecord) => void,
): Promise<RingingRecord[]> {
  const callIds = await redis.smembers(INDEX_KEY);
  const claimed: RingingRecord[] = [];
  for (const callId of callIds) {
    const raw = await redis.get(recordKey(callId));
    if (raw == null) {
      // Record already gone (cleared/claimed/GC'd) — drop the stale index entry.
      await redis.srem(INDEX_KEY, callId);
      continue;
    }
    let rec: RingingRecord;
    try {
      rec = JSON.parse(raw) as RingingRecord;
    } catch {
      await clearRinging(redis, callId);
      continue;
    }
    if (now < rec.expiresAt) continue; // not due yet
    // Atomic claim: only the instance that gets the non-null value emits.
    const won = await redis.getdel(recordKey(callId));
    await redis.srem(INDEX_KEY, callId);
    if (won == null) continue; // another instance claimed it first
    claimed.push(rec);
    emit(rec);
  }
  return claimed;
}

/**
 * Start the per-instance sweep loop. Returns a stop function. `nowFn` is
 * injectable for tests; production uses `Date.now`.
 */
export function startSweeper(
  redis: RingingRedis,
  emit: (rec: RingingRecord) => void,
  intervalMs: number = SWEEP_INTERVAL_MS,
  nowFn: () => number = Date.now,
): () => void {
  const handle = setInterval(() => {
    void sweepOnce(redis, nowFn(), emit).catch(() => undefined);
  }, intervalMs);
  // Don't keep the event loop alive solely for the sweeper. Cast for unref:
  // with both DOM + node libs in scope the setInterval return type is ambiguous
  // (number vs NodeJS.Timeout), so reach for unref defensively.
  (handle as unknown as { unref?: () => void }).unref?.();
  return () => clearInterval(handle as unknown as Parameters<typeof clearInterval>[0]);
}
