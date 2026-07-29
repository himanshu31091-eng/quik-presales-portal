import type { AddressInfo } from "node:net";
import RedisMock from "ioredis-mock";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Membership/channel lookups resolve against the in-memory fake — no live DB.
vi.mock("@quikit/database", async () => await import("./testdb"));

import { createGateway, type Gateway } from "./gateway";
import { createMetrics } from "./metrics";
import type { FanoutEvent } from "./fanout-contract";
import { FANOUT_CHANNEL } from "./fanout-contract";
import { userRoom } from "./rooms";
import { FIXTURES } from "./testdb";

const { orgA, orgB, alice, bob, carol, general, announcements, nonMember } = FIXTURES;
const SECRET = "test-realtime-secret";

let gateway: Gateway;
let url = "";
let pub: InstanceType<typeof RedisMock>;
let fanoutSub: InstanceType<typeof RedisMock>;

const openSockets: Socket[] = [];

function mintToken(userId: string, orgId: string, expiresIn: string | number = "60s"): string {
  return jwt.sign({ userId, orgId }, SECRET, { expiresIn });
}

function connectReady(token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, {
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    openSockets.push(s);
    s.on("ready", () => resolve(s));
    s.on("connect_error", (err) => reject(err));
  });
}

function connectExpectError(token?: string): Promise<Error> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, {
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    openSockets.push(s);
    s.on("connect_error", (err) => resolve(err as Error));
    s.on("ready", () => reject(new Error("expected connection to be rejected")));
    s.on("connect", () => reject(new Error("expected connection to be rejected")));
  });
}

function waitForEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function publishEvent(evt: FanoutEvent): Promise<void> {
  return Promise.resolve(pub.publish(FANOUT_CHANNEL, JSON.stringify(evt))).then(() => undefined);
}

beforeAll(async () => {
  pub = new RedisMock();
  fanoutSub = new RedisMock();
  gateway = createGateway({
    tokenSecret: SECRET,
    allowedOrigins: "*",
    fanoutSubscriber: fanoutSub as never,
    healthCheck: () => true,
    metrics: createMetrics({ collectDefault: false }),
  });
  await new Promise<void>((resolve) => gateway.httpServer.listen(0, resolve));
  url = `http://localhost:${(gateway.httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const s of openSockets.splice(0)) s.disconnect();
});

afterAll(async () => {
  await gateway.close();
  await Promise.allSettled([pub.quit(), fanoutSub.quit()]);
});

describe("handshake auth", () => {
  it("rejects a connection with no token", async () => {
    const err = await connectExpectError();
    expect(err.message).toMatch(/token/i);
  });

  it("rejects an invalid token", async () => {
    const err = await connectExpectError("not-a-jwt");
    expect(err.message).toMatch(/unauthorized/i);
  });

  it("rejects an expired token", async () => {
    const err = await connectExpectError(mintToken(alice, orgA, -10));
    expect(err.message).toMatch(/unauthorized/i);
  });

  it("accepts a valid token and joins the user room", async () => {
    await connectReady(mintToken(alice, orgA));
    const inUserRoom = await gateway.io.in(userRoom(orgA, alice)).fetchSockets();
    expect(inUserRoom.length).toBe(1);
  });
});

describe("join authorization", () => {
  it("lets a member join its channel room", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    expect(await a.emitWithAck("join", general)).toEqual({ ok: true });
  });

  it("rejects a non-member join (same org)", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    expect(await a.emitWithAck("join", nonMember)).toEqual({ ok: false });
  });

  it("rejects a cross-org join", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    expect(await a.emitWithAck("join", announcements)).toEqual({ ok: false });
  });

  it("throttles a join flood (per-socket inbound rate limit)", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    let acked = { ok: true };
    for (let i = 0; i < 21; i++) {
      acked = (await a.emitWithAck("join", general)) as { ok: boolean };
    }
    expect(acked).toEqual({ ok: false });
  });
});

describe("tenant isolation at the realtime layer", () => {
  it("delivers an acme message only to acme members in the room", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const c = await connectReady(mintToken(carol, orgB));

    let carolGot = false;
    c.on("message", () => {
      carolGot = true;
    });
    const aliceMsg = waitForEvent(a, "message");

    const payload = { id: "m-iso", channelId: general, content: "acme secret" };
    await publishEvent({ orgId: orgA, channelId: general, event: "message", payload });

    expect(await aliceMsg).toEqual(payload);
    await delay(150);
    expect(carolGot).toBe(false);
  });
});

describe("fan-out delivery", () => {
  it("routes message / message_update / reaction verbatim to the channel room", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    for (const event of ["message", "message_update", "reaction"] as const) {
      const payload = { id: `m-${event}`, channelId: general, content: event };
      const got = waitForEvent(a, event);
      await publishEvent({ orgId: orgA, channelId: general, event, payload });
      expect(await got).toEqual(payload);
    }
  });

  it("delivers a system event as a `message` with the full payload", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const payload = { id: "m-sys", channelId: general, type: "SystemActivity", content: "hi" };
    const got = waitForEvent(a, "message");
    await publishEvent({ orgId: orgA, channelId: general, event: "system", payload });
    expect(await got).toEqual(payload);
  });
});

describe("notification (per-user routing)", () => {
  it("delivers a `notification` to the recipient's user room only", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const c = await connectReady(mintToken(carol, orgB));

    let carolGot = false;
    c.on("notification", () => {
      carolGot = true;
    });
    const aliceGot = waitForEvent(a, "notification");

    const payload = { id: "n-1", type: "mention" };
    await publishEvent({ orgId: orgA, channelId: general, event: "notification", payload, userId: alice });

    expect(await aliceGot).toEqual(payload);
    await delay(150);
    expect(carolGot).toBe(false);
  });

  it("is not delivered to a different user in the same org", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const b = await connectReady(mintToken(bob, orgA));

    let aliceGot = false;
    a.on("notification", () => {
      aliceGot = true;
    });
    const bobGot = waitForEvent(b, "notification");

    const payload = { id: "n-2", type: "dm" };
    await publishEvent({ orgId: orgA, channelId: general, event: "notification", payload, userId: bob });

    expect(await bobGot).toEqual(payload);
    await delay(150);
    expect(aliceGot).toBe(false);
  });
});

describe("channel_created", () => {
  it("joins the listed members to the new room so a later message reaches them", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const newChannelId = "rt-created-channel";

    await publishEvent({
      orgId: orgA,
      channelId: newChannelId,
      event: "channel_created",
      payload: { channelId: newChannelId, memberIds: [alice] },
    });
    await delay(100); // let socketsJoin settle

    const payload = { id: "m-new", channelId: newChannelId, content: "hello new room" };
    const got = waitForEvent(a, "message");
    await publishEvent({ orgId: orgA, channelId: newChannelId, event: "message", payload });
    expect(await got).toEqual(payload);
  });
});
