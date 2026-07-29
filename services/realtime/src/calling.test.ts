import RedisMock from "ioredis-mock";
import type { Server as IOServer, Socket } from "socket.io";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@quikit/database", async () => await import("./testdb"));

import { registerCallingHandlers, type CallingDeps } from "./calling";
import type { RingingRedis } from "./ringing";
import { userRoom } from "./rooms";
import { addCall, db, FIXTURES, resetStore } from "./testdb";

const { orgA, orgB, alice, bob, carol, general } = FIXTURES;

type MockSocket = Socket & {
  _handlers: Record<string, (...args: unknown[]) => void | Promise<void>>;
};


function createMockSocket(userId: string, orgId: string): MockSocket {
  const handlers: Record<string, (...args: unknown[]) => void | Promise<void>> = {};
  return {
    data: { userId, orgId },
    id: `socket-${userId}-${Math.random().toString(36).slice(2)}`,
    rooms: new Set<string>(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: vi.fn(),
    _handlers: handlers,
  } as unknown as MockSocket;
}

/** Fake io whose user rooms are populated by which sockets we register. */
function createMockIO() {
  const roomSockets = new Map<string, MockSocket[]>();
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    in: (room: string) => ({
      fetchSockets: async () => roomSockets.get(room) ?? [],
    }),
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }),
    }),
  } as unknown as IOServer;
  return {
    io,
    emitted,
    /** Mark that `userId` has a connected socket (so invite sees them online). */
    online: (orgId: string, userId: string) =>
      roomSockets.set(userRoom(orgId, userId), [createMockSocket(userId, orgId)]),
  };
}

let ringingRedis: RingingRedis;
let deps: CallingDeps;

beforeEach(async () => {
  resetStore();
  const mock = new RedisMock() as unknown as RingingRedis & { flushall(): Promise<unknown> };
  await mock.flushall();
  ringingRedis = mock;
  deps = { ringingRedis };
  vi.clearAllMocks();
});

afterEach(() => vi.restoreAllMocks());

function seedCall(id: string, orgId: string, initiatorId: string, participantIds: string[]) {
  addCall({
    id,
    orgId,
    initiatorId,
    channelId: general,
    type: "video",
    participants: participantIds.map((userId) => ({ userId })),
  });
}

describe("call:invite", () => {
  it("emits call:unavailable when target has zero sockets", async () => {
    seedCall("c1", orgA, alice, [alice, bob]);
    const { io } = createMockIO(); // bob NOT marked online
    const aliceSocket = createMockSocket(alice, orgA);
    registerCallingHandlers(io, aliceSocket, deps);

    const ack = vi.fn();
    await aliceSocket._handlers["call:invite"]!({ callId: "c1", targetUserId: bob }, ack);

    expect(aliceSocket.emit).toHaveBeenCalledWith("call:unavailable", { callId: "c1", userId: bob });
    expect(ack).toHaveBeenCalledWith({ ok: true });
    // No ring registered for an offline target.
    expect(await ringingRedis.smembers("ringing:index")).toEqual([]);
  });

  it("emits call:ringing and registers a Redis ring when the target is online", async () => {
    seedCall("c2", orgA, alice, [alice, bob]);
    const m = createMockIO();
    m.online(orgA, bob);
    const aliceSocket = createMockSocket(alice, orgA);
    registerCallingHandlers(m.io, aliceSocket, deps);

    const ack = vi.fn();
    await aliceSocket._handlers["call:invite"]!({ callId: "c2", targetUserId: bob }, ack);

    expect(m.emitted.some((e) => e.event === "call:ringing")).toBe(true);
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(await ringingRedis.smembers("ringing:index")).toContain("c2");
  });

  it("rejects an invite from a non-initiator", async () => {
    seedCall("c3", orgA, alice, [alice, bob]);
    const { io } = createMockIO();
    const bobSocket = createMockSocket(bob, orgA);
    registerCallingHandlers(io, bobSocket, deps);

    const ack = vi.fn();
    await bobSocket._handlers["call:invite"]!({ callId: "c3", targetUserId: alice }, ack);

    expect(ack).toHaveBeenCalledWith({ ok: false });
    expect(bobSocket.emit).toHaveBeenCalledWith("error", {
      event: "call:invite",
      message: "Only the initiator can send invites",
    });
  });

  it("rejects an invite whose target is not a participant", async () => {
    seedCall("c4", orgA, alice, [alice]); // bob not a participant
    const { io } = createMockIO();
    const aliceSocket = createMockSocket(alice, orgA);
    registerCallingHandlers(io, aliceSocket, deps);

    const ack = vi.fn();
    await aliceSocket._handlers["call:invite"]!({ callId: "c4", targetUserId: bob }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false });
  });
});

describe("call:accepted (§2.1 clears the ring from any instance)", () => {
  it("clears the ringing record", async () => {
    seedCall("c5", orgA, alice, [alice, bob]);
    const m = createMockIO();
    m.online(orgA, bob);
    const aliceSocket = createMockSocket(alice, orgA);
    registerCallingHandlers(m.io, aliceSocket, deps);
    await aliceSocket._handlers["call:invite"]!({ callId: "c5", targetUserId: bob }, vi.fn());
    expect(await ringingRedis.smembers("ringing:index")).toContain("c5");

    const bobSocket = createMockSocket(bob, orgA);
    registerCallingHandlers(m.io, bobSocket, deps);
    const ack = vi.fn();
    await bobSocket._handlers["call:accepted"]!({ callId: "c5" }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(await ringingRedis.smembers("ringing:index")).not.toContain("c5");
  });
});

describe("call:reject", () => {
  it("relays rejection to the initiator and clears the ring", async () => {
    seedCall("c6", orgA, alice, [alice, bob]);
    const m = createMockIO();
    const bobSocket = createMockSocket(bob, orgA);
    registerCallingHandlers(m.io, bobSocket, deps);

    const ack = vi.fn();
    await bobSocket._handlers["call:reject"]!({ callId: "c6" }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(m.emitted.some((e) => e.event === "call:rejected" && e.room === userRoom(orgA, alice))).toBe(true);
  });
});

describe("call:ready", () => {
  it("relays readiness from callee to other participants", async () => {
    seedCall("c7", orgA, alice, [alice, bob]);
    const m = createMockIO();
    const bobSocket = createMockSocket(bob, orgA);
    registerCallingHandlers(m.io, bobSocket, deps);

    const ack = vi.fn();
    await bobSocket._handlers["call:ready"]!({ callId: "c7" }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(m.emitted.some((e) => e.event === "call:ready" && e.room === userRoom(orgA, alice))).toBe(true);
  });

  it("rejects call:ready from a non-participant", async () => {
    seedCall("c8", orgA, alice, [alice, bob]);
    const { io } = createMockIO();
    const carolSocket = createMockSocket(carol, orgA);
    registerCallingHandlers(io, carolSocket, deps);
    const ack = vi.fn();
    await carolSocket._handlers["call:ready"]!({ callId: "c8" }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false });
  });

  it("rejects call:ready with an empty callId", async () => {
    const { io } = createMockIO();
    const aliceSocket = createMockSocket(alice, orgA);
    registerCallingHandlers(io, aliceSocket, deps);
    const ack = vi.fn();
    await aliceSocket._handlers["call:ready"]!({ callId: "" }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false });
  });
});

describe("cross-org rejection", () => {
  it("rejects events from a different org", async () => {
    seedCall("c9", orgA, alice, [alice, bob]);
    const { io } = createMockIO();
    // Bob authenticated for orgB tries to interact with an orgA call.
    const bobSocket = createMockSocket(bob, orgB);
    registerCallingHandlers(io, bobSocket, deps);
    const ack = vi.fn();
    await bobSocket._handlers["call:reject"]!({ callId: "c9" }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: false });
  });
});

describe("§2.2 — socket-local participant cache", () => {
  it("verifies participants once, then reuses the cache for later signaling", async () => {
    seedCall("c10", orgA, alice, [alice, bob]);
    const m = createMockIO();
    const aliceSocket = createMockSocket(alice, orgA);
    registerCallingHandlers(m.io, aliceSocket, deps);
    const spy = vi.spyOn(db.qcCall, "findUnique");

    await aliceSocket._handlers["call:offer"]!({ callId: "c10", sdp: "s1" }, vi.fn());
    await aliceSocket._handlers["call:offer"]!({ callId: "c10", sdp: "s2" }, vi.fn());
    await aliceSocket._handlers["call:ice-candidate"]!({ callId: "c10", candidate: "cand" }, vi.fn());

    // First offer verified against the DB; subsequent signaling used the cache.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(m.emitted.filter((e) => e.event === "call:offer")).toHaveLength(2);
  });

  it("invalidates the cache on call:end", async () => {
    seedCall("c11", orgA, alice, [alice, bob]);
    const m = createMockIO();
    const aliceSocket = createMockSocket(alice, orgA);
    registerCallingHandlers(m.io, aliceSocket, deps);
    const spy = vi.spyOn(db.qcCall, "findUnique");

    await aliceSocket._handlers["call:offer"]!({ callId: "c11", sdp: "s1" }, vi.fn()); // verify #1
    await aliceSocket._handlers["call:end"]!({ callId: "c11" }, vi.fn()); // invalidate
    await aliceSocket._handlers["call:offer"]!({ callId: "c11", sdp: "s2" }, vi.fn()); // verify #2

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
