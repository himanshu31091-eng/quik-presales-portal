import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  rateLimit,
  rateLimitAsync,
  MemoryRateLimitStore,
  _resetDefaultStore,
} from "../lib/rateLimit";

// Control REDIS_URL presence per test. getRedis() reads process.env at call time,
// so unsetting it between tests is enough to simulate "Redis unavailable".
const ORIGINAL_REDIS_URL = process.env.REDIS_URL;

beforeEach(() => {
  delete process.env.REDIS_URL;
});

afterEach(() => {
  if (ORIGINAL_REDIS_URL === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = ORIGINAL_REDIS_URL;
  }
});

/* ─── Sync / in-memory ─────────────────────────────────────────────────── */

describe("rateLimit (sync, in-memory)", () => {
  beforeEach(() => _resetDefaultStore());

  it("allows calls below the limit and records remaining correctly", () => {
    const base = { routeKey: "test", clientKey: "alice", limit: 3, windowMs: 60_000 };
    expect(rateLimit(base)).toMatchObject({ ok: true, remaining: 2 });
    expect(rateLimit(base)).toMatchObject({ ok: true, remaining: 1 });
    expect(rateLimit(base)).toMatchObject({ ok: true, remaining: 0 });
  });

  it("blocks once the limit is exceeded", () => {
    const base = { routeKey: "test", clientKey: "alice", limit: 2, windowMs: 60_000 };
    rateLimit(base);
    rateLimit(base);
    expect(rateLimit(base)).toMatchObject({ ok: false });
  });

  it("does not collide across distinct clientKeys", () => {
    const base = { routeKey: "test", limit: 1, windowMs: 60_000 };
    expect(rateLimit({ ...base, clientKey: "alice" })).toMatchObject({ ok: true });
    expect(rateLimit({ ...base, clientKey: "bob" })).toMatchObject({ ok: true });
    expect(rateLimit({ ...base, clientKey: "alice" })).toMatchObject({ ok: false });
  });

  it("does not collide across distinct routeKeys", () => {
    const base = { clientKey: "alice", limit: 1, windowMs: 60_000 };
    expect(rateLimit({ ...base, routeKey: "login" })).toMatchObject({ ok: true });
    expect(rateLimit({ ...base, routeKey: "kpi" })).toMatchObject({ ok: true });
    expect(rateLimit({ ...base, routeKey: "login" })).toMatchObject({ ok: false });
  });

  it("resets after the window rolls over", () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
      vi.setSystemTime(t0);
      const base = { routeKey: "r", clientKey: "a", limit: 1, windowMs: 60_000 };
      expect(rateLimit(base).ok).toBe(true);
      expect(rateLimit(base).ok).toBe(false);
      // Advance past the window boundary
      vi.setSystemTime(t0 + 61_000);
      expect(rateLimit(base).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("MemoryRateLimitStore.reset() clears all buckets", () => {
    const store = new MemoryRateLimitStore();
    const opts = { routeKey: "r", clientKey: "a", limit: 1, windowMs: 60_000, store };
    rateLimit(opts);
    expect(rateLimit(opts).ok).toBe(false);
    store.reset();
    expect(rateLimit(opts).ok).toBe(true);
  });
});

/* ─── Async / fail-closed semantics (no Redis) ─────────────────────────── */

describe("rateLimitAsync (fallback behavior when Redis unavailable)", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    _resetDefaultStore();
  });

  it("falls back to in-memory when Redis is unset (fail-open default)", async () => {
    const base = { routeKey: "r", clientKey: "a", limit: 2, windowMs: 60_000 };
    const r1 = await rateLimitAsync(base);
    expect(r1.ok).toBe(true);
    expect(r1.redisAvailable).toBe(false);

    const r2 = await rateLimitAsync(base);
    expect(r2.ok).toBe(true);

    const r3 = await rateLimitAsync(base);
    expect(r3.ok).toBe(false);
  });

  it("blocks immediately when failClosed is set and Redis is unavailable", async () => {
    const base = {
      routeKey: "r",
      clientKey: "a",
      limit: 100,
      windowMs: 60_000,
      failClosed: true,
    };
    const r = await rateLimitAsync(base);
    expect(r.ok).toBe(false);
    expect(r.redisAvailable).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });
});
