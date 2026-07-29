/**
 * In-memory fake of the `@quikit/database` `db` client for tests.
 *
 * The monorepo has no acme/globex chat seed, and apps/quikchat excludes all
 * DB-backed tests from Vitest. So instead of requiring a live Postgres, the
 * gateway's DB-touching tests mock `@quikit/database` with this module:
 *
 *   vi.mock("@quikit/database", async () => await import("./testdb"));
 *
 * The mock factory's dynamic import and each test's static import resolve to
 * the SAME module instance, so tests mutate the store (addCall/resetStore) and
 * the mocked `db` reads it. Only the query shapes the gateway actually uses are
 * implemented (mirroring channels.service.ts / authz.ts / calling.ts).
 */

export interface FakeChannel {
  id: string;
  orgId: string;
}
export interface FakeMember {
  orgId: string;
  channelId: string;
  userId: string;
}
export interface FakeCall {
  id: string;
  orgId: string;
  initiatorId: string;
  channelId: string;
  type: string;
  participants: Array<{ userId: string }>;
}

export const FIXTURES = {
  orgA: "org-acme",
  orgB: "org-globex",
  alice: "u-alice",
  bob: "u-bob",
  carol: "u-carol",
  general: "ch-general", // orgA: alice + bob
  announcements: "ch-announcements", // orgB: carol
  nonMember: "ch-nonmember", // orgA: bob only (alice is NOT a member)
} as const;

interface Store {
  channels: Map<string, FakeChannel>;
  members: FakeMember[];
  calls: Map<string, FakeCall>;
}

function seedStore(): Store {
  const { orgA, orgB, alice, bob, carol, general, announcements, nonMember } = FIXTURES;
  return {
    channels: new Map<string, FakeChannel>([
      [general, { id: general, orgId: orgA }],
      [announcements, { id: announcements, orgId: orgB }],
      [nonMember, { id: nonMember, orgId: orgA }],
    ]),
    members: [
      { orgId: orgA, channelId: general, userId: alice },
      { orgId: orgA, channelId: general, userId: bob },
      { orgId: orgB, channelId: announcements, userId: carol },
      { orgId: orgA, channelId: nonMember, userId: bob },
    ],
    calls: new Map<string, FakeCall>(),
  };
}

const store: Store = seedStore();

/** Reset to the seed fixtures (call in beforeEach/afterEach). */
export function resetStore(): void {
  const fresh = seedStore();
  store.channels = fresh.channels;
  store.members = fresh.members;
  store.calls = fresh.calls;
}

/** Register a call the calling handlers can look up. */
export function addCall(call: FakeCall): void {
  store.calls.set(call.id, call);
}

// --- Prisma-shaped fake (only the methods the gateway uses) ---

export const db = {
  qcChannel: {
    async findUnique(args: { where: { id: string } }): Promise<FakeChannel | null> {
      return store.channels.get(args.where.id) ?? null;
    },
  },
  qcChannelMember: {
    async findUnique(args: {
      where: { orgId_channelId_userId: { orgId: string; channelId: string; userId: string } };
    }): Promise<FakeMember | null> {
      const { orgId, channelId, userId } = args.where.orgId_channelId_userId;
      return (
        store.members.find(
          (m) => m.orgId === orgId && m.channelId === channelId && m.userId === userId,
        ) ?? null
      );
    },
    async findMany(args: {
      where: { orgId: string; userId?: string; channelId?: { in: string[] } };
      select?: { channelId?: boolean; userId?: boolean };
    }): Promise<Array<{ channelId?: string; userId?: string }>> {
      const { orgId, userId, channelId } = args.where;
      const rows = store.members.filter((m) => {
        if (m.orgId !== orgId) return false;
        if (userId != null && m.userId !== userId) return false;
        if (channelId?.in && !channelId.in.includes(m.channelId)) return false;
        return true;
      });
      const sel = args.select ?? { channelId: true, userId: true };
      return rows.map((m) => {
        const out: { channelId?: string; userId?: string } = {};
        if (sel.channelId) out.channelId = m.channelId;
        if (sel.userId) out.userId = m.userId;
        return out;
      });
    },
  },
  qcCall: {
    async findUnique(args: {
      where: { id: string };
      include?: { participants?: boolean };
    }): Promise<FakeCall | null> {
      return store.calls.get(args.where.id) ?? null;
    },
  },
};
