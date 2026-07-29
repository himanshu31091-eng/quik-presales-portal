import type { AddressInfo } from "node:net";
import RedisMock from "ioredis-mock";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@quikit/database", async () => await import("./testdb"));

import { createGateway, type Gateway } from "./gateway";
import { createMetrics } from "./metrics";
import { FIXTURES } from "./testdb";

const { orgA, orgB, alice, bob, carol, general, announcements } = FIXTURES;
const SECRET = "test-realtime-secret";

let gateway: Gateway;
let url = "";
let fanoutMock: InstanceType<typeof RedisMock>;
let presenceMock: InstanceType<typeof RedisMock>;

const openSockets: Socket[] = [];

function mintToken(userId: string, orgId: string): string {
  return jwt.sign({ userId, orgId }, SECRET, { expiresIn: "60s" });
}

function connectReady(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    openSockets.push(s);
    s.on("ready", () => resolve(s));
    s.on("connect_error", reject);
  });
}

function connectWithSnapshot(token: string): Promise<{ socket: Socket; snapshot: string[] }> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    openSockets.push(s);
    let snapshot: string[] = [];
    s.on("presence_snapshot", (p: { userIds: string[] }) => {
      snapshot = p.userIds;
    });
    s.on("ready", () => resolve({ socket: s, snapshot }));
    s.on("connect_error", reject);
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

function expectNoEvent(socket: Socket, event: string, windowMs = 200): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (p: unknown) => reject(new Error(`unexpected "${event}": ${JSON.stringify(p)}`));
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, windowMs);
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  fanoutMock = new RedisMock();
  presenceMock = new RedisMock();
  gateway = createGateway({
    tokenSecret: SECRET,
    allowedOrigins: "*",
    fanoutSubscriber: fanoutMock as never,
    presenceRedis: presenceMock as never,
    healthCheck: () => true,
    metrics: createMetrics({ collectDefault: false }),
  });
  await new Promise<void>((resolve) => gateway.httpServer.listen(0, resolve));
  url = `http://localhost:${(gateway.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const s of openSockets.splice(0)) s.disconnect();
  // Let server-side disconnect handlers (markOffline) settle.
  await delay(80);
});

afterAll(async () => {
  await gateway.close();
  await Promise.allSettled([fanoutMock.quit(), presenceMock.quit()]);
});

describe("presence", () => {
  it("broadcasts `online` to shared-channel members when a user connects", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const got = waitForEvent<{ userId: string; status: string }>(a, "presence");
    await connectReady(mintToken(bob, orgA)); // member of #general too
    expect(await got).toMatchObject({ userId: bob, status: "online" });
  });

  it("seeds a connecting socket with a snapshot of who's already online", async () => {
    await connectReady(mintToken(alice, orgA));
    const { snapshot } = await connectWithSnapshot(mintToken(bob, orgA));
    expect(snapshot).toContain(alice);
  });

  it("does not leak presence across orgs (no shared channel)", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const noLeak = expectNoEvent(a, "presence");
    await connectReady(mintToken(carol, orgB)); // globex — shares nothing with acme
    await noLeak;
  });

  it("multi-tab: stays online until the LAST socket leaves, then broadcasts offline", async () => {
    const b = await connectReady(mintToken(bob, orgA)); // observer in #general

    const online = waitForEvent(b, "presence");
    const tab1 = await connectReady(mintToken(alice, orgA));
    expect(await online).toMatchObject({ userId: alice, status: "online" });

    const noSecondOnline = expectNoEvent(b, "presence");
    const tab2 = await connectReady(mintToken(alice, orgA));
    await noSecondOnline;

    const noOffline = expectNoEvent(b, "presence", 250);
    tab1.disconnect();
    await noOffline;

    const offline = waitForEvent<{ userId: string; status: string; lastSeen?: string }>(b, "presence");
    tab2.disconnect();
    const evt = await offline;
    expect(evt).toMatchObject({ userId: alice, status: "offline" });
    expect(typeof evt.lastSeen).toBe("string");

    await delay(50);
  });
});

describe("typing", () => {
  it("relays `typing` to the channel room EXCLUDING the sender", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const b = await connectReady(mintToken(bob, orgA));

    const bobGot = waitForEvent<{ channelId: string; userId: string }>(b, "typing");
    const aliceShouldNotEcho = expectNoEvent(a, "typing");

    a.emit("typing", { channelId: general });

    expect(await bobGot).toEqual({ channelId: general, userId: alice });
    await aliceShouldNotEcho;
  });

  it("drops `typing` for a channel the socket is not a member of", async () => {
    const a = await connectReady(mintToken(alice, orgA));
    const c = await connectReady(mintToken(carol, orgB)); // member of #announcements

    const carolShouldNotGet = expectNoEvent(c, "typing", 300);
    a.emit("typing", { channelId: announcements }); // alice is not in that room
    await carolShouldNotGet;
  });
});
