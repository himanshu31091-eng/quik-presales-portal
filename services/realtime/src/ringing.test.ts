import RedisMock from "ioredis-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRinging,
  RING_MS,
  setRinging,
  sweepOnce,
  type RingingRecord,
  type RingingRedis,
} from "./ringing";

let redis: RingingRedis;

const REC = {
  callId: "call-1",
  initiatorId: "u-alice",
  targetUserId: "u-bob",
  channelId: "ch-1",
  orgId: "org-a",
};

beforeEach(async () => {
  const mock = new RedisMock() as unknown as RingingRedis & { flushall(): Promise<unknown> };
  await mock.flushall();
  redis = mock;
});

function collector() {
  const fired: RingingRecord[] = [];
  return { fired, emit: (r: RingingRecord) => fired.push(r) };
}

describe("expiresAt gate (Correction 2 — PX is not the timer)", () => {
  it("does NOT fire before the 30s deadline (sweep at t+5s)", async () => {
    const t0 = 1_000_000;
    await setRinging(redis, REC, t0);
    const { fired, emit } = collector();
    // A sweep 5s later — well before the 30s deadline — must not fire.
    const claimed = await sweepOnce(redis, t0 + 5_000, emit);
    expect(claimed).toEqual([]);
    expect(fired).toEqual([]);
    // Record still present.
    expect(await redis.get("ringing:call-1")).not.toBeNull();
  });

  it("fires once the deadline passes and clears the record + index", async () => {
    const t0 = 1_000_000;
    await setRinging(redis, REC, t0);
    const { fired, emit } = collector();
    const claimed = await sweepOnce(redis, t0 + RING_MS + 1, emit);
    expect(claimed).toHaveLength(1);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ callId: "call-1", initiatorId: "u-alice", targetUserId: "u-bob" });
    // Claimed → record deleted, index entry removed.
    expect(await redis.get("ringing:call-1")).toBeNull();
    expect(await redis.smembers("ringing:index")).toEqual([]);
  });
});

describe("clear on accept/reject/cancel/end", () => {
  it("a cleared record never fires even after the deadline", async () => {
    const t0 = 1_000_000;
    await setRinging(redis, REC, t0);
    await clearRinging(redis, REC.callId); // e.g. call:accepted from any instance
    const { fired, emit } = collector();
    const claimed = await sweepOnce(redis, t0 + RING_MS + 1, emit);
    expect(claimed).toEqual([]);
    expect(fired).toEqual([]);
    expect(await redis.smembers("ringing:index")).toEqual([]);
  });
});

describe("exactly-once across instances (GETDEL claim)", () => {
  it("two instances sweeping the same expired record emit exactly once", async () => {
    const t0 = 1_000_000;
    await setRinging(redis, REC, t0);
    const a = collector();
    const b = collector();
    // Instance A sweeps first and claims via GETDEL; instance B sees it gone.
    const claimedA = await sweepOnce(redis, t0 + RING_MS + 1, a.emit);
    const claimedB = await sweepOnce(redis, t0 + RING_MS + 1, b.emit);
    expect(claimedA).toHaveLength(1);
    expect(claimedB).toEqual([]);
    expect(a.fired.length + b.fired.length).toBe(1);
  });
});

describe("orphan handling", () => {
  it("drops a stale index entry whose record has expired out of Redis", async () => {
    // Simulate a record that was GC'd (safety TTL fired) but index lingers.
    await redis.sadd("ringing:index", "ghost");
    const { fired, emit } = collector();
    const claimed = await sweepOnce(redis, 2_000_000, emit);
    expect(claimed).toEqual([]);
    expect(fired).toEqual([]);
    expect(await redis.smembers("ringing:index")).toEqual([]);
  });
});
