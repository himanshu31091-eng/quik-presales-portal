import type { Server as IOServer } from "socket.io";
import { describe, expect, it, vi } from "vitest";

// dispatchFanout is pure, but it lives in gateway.ts whose import graph pulls in
// calling.ts → @quikit/database (which eagerly constructs a PrismaClient at
// import). Mock it so the unit test needs no DATABASE_URL / live DB.
vi.mock("@quikit/database", async () => await import("./testdb"));

import { dispatchFanout } from "./gateway";
import { channelRoom, userRoom } from "./rooms";

// A minimal fake IOServer that records `.to(room).emit(...)` and
// `.in(rooms).socketsJoin(target)` so we can assert routing without a socket
// server or a database.
function fakeIo() {
  const emits: Array<{ room: string; event: string; payload: unknown }> = [];
  const joins: Array<{ rooms: string[]; target: string }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emits.push({ room, event, payload }),
    }),
    in: (rooms: string | string[]) => ({
      socketsJoin: (target: string) =>
        joins.push({ rooms: Array.isArray(rooms) ? rooms : [rooms], target }),
    }),
  } as unknown as IOServer;
  return { io, emits, joins };
}

const ORG = "org-a";
const CH = "ch-1";

describe("dispatchFanout routing", () => {
  it("routes message / message_update / reaction / read / delivered verbatim to the channel room", () => {
    for (const event of ["message", "message_update", "reaction", "read", "delivered"] as const) {
      const { io, emits } = fakeIo();
      const payload = { id: event };
      dispatchFanout(io, { orgId: ORG, channelId: CH, event, payload });
      expect(emits).toEqual([{ room: channelRoom(ORG, CH), event, payload }]);
    }
  });

  it("delivers a `system` event to the channel room as a `message`", () => {
    const { io, emits } = fakeIo();
    const payload = { id: "m-sys", content: "alice joined" };
    dispatchFanout(io, { orgId: ORG, channelId: CH, event: "system", payload });
    expect(emits).toEqual([{ room: channelRoom(ORG, CH), event: "message", payload }]);
  });

  it("routes a `notification` to the recipient's user room", () => {
    const { io, emits } = fakeIo();
    const payload = { id: "n-1" };
    dispatchFanout(io, { orgId: ORG, channelId: CH, event: "notification", payload, userId: "u-bob" });
    expect(emits).toEqual([{ room: userRoom(ORG, "u-bob"), event: "notification", payload }]);
  });

  it("drops a `notification` with no userId", () => {
    const { io, emits } = fakeIo();
    dispatchFanout(io, { orgId: ORG, channelId: CH, event: "notification", payload: {} });
    expect(emits).toEqual([]);
  });

  it("joins listed members to the new room on channel_created", () => {
    const { io, joins } = fakeIo();
    dispatchFanout(io, {
      orgId: ORG,
      channelId: "ch-new",
      event: "channel_created",
      payload: { channelId: "ch-new", memberIds: ["u-a", "u-b"] },
    });
    expect(joins).toEqual([
      { rooms: [userRoom(ORG, "u-a"), userRoom(ORG, "u-b")], target: channelRoom(ORG, "ch-new") },
    ]);
  });

  it("ignores a malformed channel_created payload", () => {
    const { io, joins, emits } = fakeIo();
    dispatchFanout(io, {
      orgId: ORG,
      channelId: "ch-new",
      event: "channel_created",
      payload: { channelId: "ch-new" }, // missing memberIds
    });
    expect(joins).toEqual([]);
    expect(emits).toEqual([]);
  });

  it("always scopes the room by evt.orgId — never the payload (tenant isolation)", () => {
    const { io, emits } = fakeIo();
    // A hostile payload naming another org must not change the target room.
    const payload = { orgId: "org-evil", channelId: "ch-evil" };
    dispatchFanout(io, { orgId: ORG, channelId: CH, event: "message", payload });
    expect(emits[0]!.room).toBe(channelRoom(ORG, CH));
  });
});
