import crypto from "node:crypto";
import { getRedis } from "@quikit/redis";

/**
 * Password-reset OTP store.
 *
 * Two TTL'd entries per reset attempt:
 *   - `otp:reset:<userId>`           = sha256(otp) — 3 minutes
 *   - `otp:reset-attempts:<userId>`  = wrong-attempt counter, same TTL
 *
 * After a successful verify, we mint a one-shot `resetToken` (random 32-byte
 * url-safe string) stored under `otp:reset-token:<token>` = userId, 5 min TTL.
 * The reset endpoint reads the userId out of that key and immediately deletes
 * it — single-use guarantee even within the 5-minute window.
 *
 * In dev (no REDIS_URL) we transparently fall back to a process-local Map
 * with manual TTL expiry. Multi-instance prod requires Redis — same trade-
 * off as the rest of the codebase (see packages/redis/index.ts).
 */

export const OTP_TTL_SECONDS = 180;
/** Registration OTP lives 5 minutes (self-serve sign-up). Password-reset OTP
 *  keeps its tighter 3-minute window via OTP_TTL_SECONDS. */
export const REGISTRATION_OTP_TTL_SECONDS = 300;
export const RESET_TOKEN_TTL_SECONDS = 300;
/** Pending-registration context (org name) outlives the OTP + reset-token hops
 *  so a user who takes the full window can still complete sign-up. */
export const PENDING_REGISTRATION_TTL_SECONDS = 30 * 60;
export const MAX_OTP_ATTEMPTS = 5;

const otpKey = (userId: string) => `otp:reset:${userId}`;
const attemptsKey = (userId: string) => `otp:reset-attempts:${userId}`;
const tokenKey = (token: string) => `otp:reset-token:${token}`;
const pendingRegKey = (userId: string) => `reg:pending:${userId}`;

/* ─── In-memory fallback ───────────────────────────────────────────────── */

interface MemEntry {
  value: string;
  expiresAt: number;
}
const memStore = new Map<string, MemEntry>();

function memGet(key: string): string | null {
  const entry = memStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memStore.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memDel(key: string): void {
  memStore.delete(key);
}

function memIncrWithTtl(key: string, ttlSeconds: number): number {
  const current = memGet(key);
  const next = (current ? parseInt(current, 10) : 0) + 1;
  memSet(key, String(next), ttlSeconds);
  return next;
}

/* ─── Public helpers ───────────────────────────────────────────────────── */

/** 6-digit zero-padded OTP, e.g. "048217". */
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/** Generate a 256-bit URL-safe random token for the reset step. */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Store an OTP hash for `userId`, replacing any previous one. Resets the
 * wrong-attempts counter so a fresh code starts with 0/5.
 *
 * `ttlSeconds` defaults to the 3-minute password-reset window; the
 * registration flow passes REGISTRATION_OTP_TTL_SECONDS (5 min).
 */
export async function storeOtp(
  userId: string,
  hash: string,
  ttlSeconds: number = OTP_TTL_SECONDS,
): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.set(otpKey(userId), hash, "EX", ttlSeconds);
    await r.del(attemptsKey(userId));
  } else {
    memSet(otpKey(userId), hash, ttlSeconds);
    memDel(attemptsKey(userId));
  }
}

/* ─── Pending self-serve registration context ──────────────────────────────
 * Holds the not-yet-created workspace details (org name) between step 1
 * (account + OTP issued) and step 3 (password set → org provisioned). Kept in
 * Redis so an abandoned sign-up never leaves an orphan Org/Subscription in
 * Postgres — only a password-less, unverified User row is persisted up front.
 */
export interface PendingRegistration {
  organizationName: string;
}

export async function storePendingRegistration(
  userId: string,
  data: PendingRegistration,
): Promise<void> {
  const payload = JSON.stringify(data);
  const r = getRedis();
  if (r) {
    await r.set(pendingRegKey(userId), payload, "EX", PENDING_REGISTRATION_TTL_SECONDS);
  } else {
    memSet(pendingRegKey(userId), payload, PENDING_REGISTRATION_TTL_SECONDS);
  }
}

/** Read the pending registration context WITHOUT consuming it (used by the
 *  resend path, which must keep the org name around for the eventual finish). */
export async function peekPendingRegistration(
  userId: string,
): Promise<PendingRegistration | null> {
  const r = getRedis();
  const raw = r ? await r.get(pendingRegKey(userId)) : memGet(pendingRegKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingRegistration;
  } catch {
    return null;
  }
}

/** Atomically read + delete the pending registration context (completion). */
export async function consumePendingRegistration(
  userId: string,
): Promise<PendingRegistration | null> {
  const r = getRedis();
  if (r) {
    try {
      const key = pendingRegKey(userId);
      const result = await r.multi().get(key).del(key).exec();
      const getReply = result?.[0];
      const value = getReply ? (getReply[1] as string | null) : null;
      return value ? (JSON.parse(value) as PendingRegistration) : null;
    } catch (err) {
      console.error("[otp-store] consumePendingRegistration redis failed:", err);
    }
  }
  const raw = memGet(pendingRegKey(userId));
  if (raw) memDel(pendingRegKey(userId));
  return raw ? (JSON.parse(raw) as PendingRegistration) : null;
}

interface VerifyResult {
  ok: boolean;
  /** True when the OTP was deleted because attempts exceeded the limit. */
  locked?: boolean;
}

/**
 * Compare a user-provided OTP against the stored hash.
 *
 *   - On success: deletes both the OTP and the attempts counter.
 *   - On wrong code: increments attempts (preserving TTL). On the Nth wrong
 *     attempt the OTP is deleted entirely — caller must request a new one.
 *   - If no OTP is stored (expired or never issued): returns `{ ok: false }`.
 */
export async function verifyOtp(userId: string, otp: string): Promise<VerifyResult> {
  const expected = hashOtp(otp);
  const r = getRedis();

  let stored: string | null;
  if (r) {
    stored = await r.get(otpKey(userId));
  } else {
    stored = memGet(otpKey(userId));
  }
  if (!stored) return { ok: false };

  if (
    stored.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(expected))
  ) {
    if (r) {
      await r.del(otpKey(userId));
      await r.del(attemptsKey(userId));
    } else {
      memDel(otpKey(userId));
      memDel(attemptsKey(userId));
    }
    return { ok: true };
  }

  // Wrong code → increment counter (keeping TTL aligned with the OTP key).
  let attempts: number;
  if (r) {
    attempts = await r.incr(attemptsKey(userId));
    if (attempts === 1) {
      await r.expire(attemptsKey(userId), OTP_TTL_SECONDS);
    }
  } else {
    attempts = memIncrWithTtl(attemptsKey(userId), OTP_TTL_SECONDS);
  }

  if (attempts >= MAX_OTP_ATTEMPTS) {
    if (r) {
      await r.del(otpKey(userId));
      await r.del(attemptsKey(userId));
    } else {
      memDel(otpKey(userId));
      memDel(attemptsKey(userId));
    }
    return { ok: false, locked: true };
  }
  return { ok: false };
}

export async function storeResetToken(token: string, userId: string): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.set(tokenKey(token), userId, "EX", RESET_TOKEN_TTL_SECONDS);
  } else {
    memSet(tokenKey(token), userId, RESET_TOKEN_TTL_SECONDS);
  }
}

/**
 * Atomically look up + delete a reset token. Returns the userId on success,
 * null if the token is unknown or already consumed.
 *
 * Implemented with a MULTI(GET, DEL) pipeline so it works on every Redis
 * server version (GETDEL is Redis ≥ 6.2) and across ioredis versions whose
 * `.call` typings vary. Two commands inside one transaction = atomic enough
 * for our purposes (no other writer touches this key).
 */
export async function consumeResetToken(token: string): Promise<string | null> {
  const r = getRedis();
  if (r) {
    try {
      const key = tokenKey(token);
      const result = await r.multi().get(key).del(key).exec();
      if (!result) return null;
      const [getReply] = result;
      if (!getReply) return null;
      const [getErr, value] = getReply as [Error | null, string | null];
      if (getErr) throw getErr;
      return (value as string | null) ?? null;
    } catch (err) {
      // If Redis is unreachable mid-flight, fall through to the in-memory
      // store. Better to honor the reset on the same instance than to 500
      // the user when their token is right there.
      console.error("[otp-store] redis consumeResetToken failed, falling back:", err);
    }
  }
  const userId = memGet(tokenKey(token));
  if (userId) memDel(tokenKey(token));
  return userId;
}
