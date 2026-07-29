import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the central DB client with the in-memory fake (shared singleton store).
vi.mock("@quikit/database", async () => await import("./testdb"));

import {
  assertMembership,
  listChannelIdsForMember,
  listMemberUserIdsForChannels,
} from "./queries";
import { FIXTURES, resetStore } from "./testdb";

const { orgA, orgB, alice, bob, carol, general, announcements, nonMember } = FIXTURES;

beforeEach(() => resetStore());

describe("assertMembership (throws, not boolean — Correction 1)", () => {
  it("resolves for a member of an in-org channel", async () => {
    await expect(assertMembership(orgA, general, alice)).resolves.toBeUndefined();
  });

  it("throws for a non-member in the same org", async () => {
    // alice is NOT a member of the nonMember channel (only bob is).
    await expect(assertMembership(orgA, nonMember, alice)).rejects.toThrow(/forbidden/i);
  });

  it("throws for a cross-org channel (channel not in org)", async () => {
    // announcements belongs to orgB; alice authenticates for orgA.
    await expect(assertMembership(orgA, announcements, alice)).rejects.toThrow(/forbidden/i);
  });

  it("throws for an unknown channel", async () => {
    await expect(assertMembership(orgA, "ch-does-not-exist", alice)).rejects.toThrow(/forbidden/i);
  });
});

describe("listChannelIdsForMember", () => {
  it("returns the caller's channel ids, org-scoped", async () => {
    expect((await listChannelIdsForMember(orgA, alice)).sort()).toEqual([general]);
    expect((await listChannelIdsForMember(orgA, bob)).sort()).toEqual([general, nonMember].sort());
    expect(await listChannelIdsForMember(orgB, carol)).toEqual([announcements]);
  });

  it("returns [] for a user with no memberships", async () => {
    expect(await listChannelIdsForMember(orgA, "u-nobody")).toEqual([]);
  });
});

describe("listMemberUserIdsForChannels", () => {
  it("returns distinct member user-ids across channels", async () => {
    const ids = await listMemberUserIdsForChannels(orgA, [general, nonMember]);
    expect(ids.sort()).toEqual([alice, bob].sort());
  });

  it("returns [] for an empty channel list without querying", async () => {
    expect(await listMemberUserIdsForChannels(orgA, [])).toEqual([]);
  });
});
