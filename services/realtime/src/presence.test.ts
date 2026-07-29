import RedisMock from "ioredis-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { markOffline, markOnline, onlineUserIds, refresh, type PresenceRedis } from "./presence";

const ORG = "org1";
const TTL = 30_000;

let redis: PresenceRedis;

// ioredis-mock shares one keyspace across `new RedisMock()` instances in a
// process, so flush before each test to keep them independent.
beforeEach(async () => {
  const mock = new RedisMock() as unknown as PresenceRedis & { flushall(): Promise<unknown> };
  await mock.flushall();
  redis = mock;
});

describe("markOnline", () => {
  it("reports the 0→1 transition only for the first socket", async () => {
    expect(await markOnline(redis, ORG, "u1", "s1", TTL)).toEqual({ firstSocket: true });
    // A second tab for the same user is NOT a new online transition.
    expect(await markOnline(redis, ORG, "u1", "s2", TTL)).toEqual({ firstSocket: false });
  });
});

describe("markOffline", () => {
  it("stays online while another socket remains", async () => {
    await markOnline(redis, ORG, "u1", "s1", TTL);
    await markOnline(redis, ORG, "u1", "s2", TTL);
    const r = await markOffline(redis, ORG, "u1", "s1");
    expect(r.lastSocket).toBe(false);
    expect(await redis.exists(`presence:${ORG}:u1`)).toBe(1);
  });

  it("reports the 1→0 transition with a lastSeen and clears the key", async () => {
    await markOnline(redis, ORG, "u1", "s1", TTL);
    const r = await markOffline(redis, ORG, "u1", "s1");
    expect(r.lastSocket).toBe(true);
    expect(typeof r.lastSeen).toBe("string");
    expect(Number.isNaN(Date.parse(r.lastSeen!))).toBe(false);
    expect(await redis.exists(`presence:${ORG}:u1`)).toBe(0);
    expect(await redis.get(`presence:lastseen:${ORG}:u1`)).toBe(r.lastSeen);
  });
});

describe("onlineUserIds (§2.3 pipelined)", () => {
  it("filters candidates to those with a live presence key", async () => {
    await markOnline(redis, ORG, "u1", "s1", TTL);
    await markOnline(redis, ORG, "u3", "s9", TTL);
    const online = await onlineUserIds(redis, ORG, ["u1", "u2", "u3"]);
    expect(online.sort()).toEqual(["u1", "u3"]);
  });

  it("scopes by org — another tenant's key never leaks", async () => {
    await markOnline(redis, "orgX", "u1", "s1", TTL);
    expect(await onlineUserIds(redis, ORG, ["u1"])).toEqual([]);
  });

  it("returns [] for an empty candidate list without touching Redis", async () => {
    expect(await onlineUserIds(redis, ORG, [])).toEqual([]);
  });
});

describe("refresh", () => {
  it("keeps the key alive without throwing", async () => {
    await markOnline(redis, ORG, "u1", "s1", TTL);
    await refresh(redis, ORG, "u1", TTL);
    expect(await redis.exists(`presence:${ORG}:u1`)).toBe(1);
  });
});
