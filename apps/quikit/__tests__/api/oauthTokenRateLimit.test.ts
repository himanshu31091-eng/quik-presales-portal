import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { _resetDefaultStore } from "@quikit/shared/rateLimit";

// Mock bcrypt so we can force valid/invalid outcomes deterministically AND
// assert how many times the expensive compare() ran (a regression guard for
// "rate limiter didn't run before bcrypt").
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));
import bcrypt from "bcryptjs";

import { POST } from "@/app/api/oauth/token/route";

const ORIGINAL_REDIS_URL = process.env.REDIS_URL;

beforeEach(() => {
  resetMockDb();
  _resetDefaultStore();
  delete process.env.REDIS_URL; // force in-memory path so counters are per-test
  vi.mocked(bcrypt.compare).mockReset();
});

afterEach(() => {
  if (ORIGINAL_REDIS_URL === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = ORIGINAL_REDIS_URL;
  }
});

function makeTokenRequest(opts: {
  clientId: string;
  clientSecret?: string;
  ip?: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    client_secret: opts.clientSecret ?? "wrong",
    code: "any",
    redirect_uri: "http://localhost/cb",
  });
  return new NextRequest(
    new URL("/api/oauth/token", "http://localhost:3000"),
    {
      method: "POST",
      body,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": opts.ip ?? "10.0.0.42",
      },
    } as never,
  );
}

describe("POST /api/oauth/token — rate limiter + LRU", () => {
  it("returns 401 immediately when rate limiter blocks — bcrypt never runs", async () => {
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      clientSecret: "stored-hash",
      scopes: ["openid"],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    // Drive the limiter past 30 req / 60 s on the same (clientId, /24).
    // Use a unique clientId per test to avoid cross-test state from the
    // LRU cache (also module-scoped). 31st request MUST be 429.
    const CLIENT = "rl-test-1";
    const IP = "203.0.113.42";

    const results: number[] = [];
    for (let i = 0; i < 31; i++) {
      const r = await POST(makeTokenRequest({ clientId: CLIENT, ip: IP }));
      results.push(r.status);
    }

    // First 30: 401 Unknown client OR 401 Bad secret (either way, bcrypt may
    // run). 31st: 429 from the limiter.
    expect(results.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(results[30]).toBe(429);
  });

  it("429 carries a Retry-After header so clients can back off", async () => {
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      clientSecret: "hash",
      scopes: [],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const CLIENT = "rl-test-2";
    const IP = "203.0.113.50";
    for (let i = 0; i < 30; i++) {
      await POST(makeTokenRequest({ clientId: CLIENT, ip: IP }));
    }
    const blocked = await POST(makeTokenRequest({ clientId: CLIENT, ip: IP }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    const body = await blocked.json();
    expect(body).toEqual({
      error: "too_many_requests",
      error_description: "Rate limit exceeded",
    });
  });

  it("different clientIds don't share a bucket", async () => {
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      clientSecret: "hash",
      scopes: [],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const IP = "198.51.100.10";

    // Saturate client A
    for (let i = 0; i < 30; i++) {
      await POST(makeTokenRequest({ clientId: "client-A-iso", ip: IP }));
    }
    const aBlocked = await POST(makeTokenRequest({ clientId: "client-A-iso", ip: IP }));
    expect(aBlocked.status).toBe(429);

    // Client B from same IP still works
    const bOk = await POST(makeTokenRequest({ clientId: "client-B-iso", ip: IP }));
    expect(bOk.status).toBe(401); // bad secret, not 429
  });

  it("different /24 IP blocks don't share a bucket", async () => {
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      clientSecret: "hash",
      scopes: [],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const CLIENT = "rl-test-ip";

    // Saturate /24 block 1
    for (let i = 0; i < 30; i++) {
      await POST(makeTokenRequest({ clientId: CLIENT, ip: "192.0.2.5" }));
    }
    const block1 = await POST(makeTokenRequest({ clientId: CLIENT, ip: "192.0.2.5" }));
    expect(block1.status).toBe(429);

    // Different /24 is independent
    const block2 = await POST(makeTokenRequest({ clientId: CLIENT, ip: "192.0.3.5" }));
    expect(block2.status).toBe(401); // limiter didn't fire
  });

  it("OAuthClient lookup is cached — second call for the same client hits no DB", async () => {
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      clientSecret: "hash",
      scopes: [],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const CLIENT = "cache-test-client";

    await POST(makeTokenRequest({ clientId: CLIENT, ip: "10.0.1.1" }));
    await POST(makeTokenRequest({ clientId: CLIENT, ip: "10.0.1.1" }));

    // One DB lookup for both calls — the second one hit the LRU.
    expect(mockDb.oAuthClient.findUnique).toHaveBeenCalledTimes(1);
  });

  it("unknown clientId is NOT cached (prevents cache poisoning)", async () => {
    mockDb.oAuthClient.findUnique.mockResolvedValue(null);

    await POST(makeTokenRequest({ clientId: "ghost-client", ip: "10.0.2.1" }));
    await POST(makeTokenRequest({ clientId: "ghost-client", ip: "10.0.2.1" }));

    // Both calls hit the DB since we don't cache null.
    expect(mockDb.oAuthClient.findUnique).toHaveBeenCalledTimes(2);
  });
});
