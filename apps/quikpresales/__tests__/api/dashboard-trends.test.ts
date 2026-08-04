import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

// The dashboard caches through Redis; bypass it so each case computes fresh.
vi.mock("@quikit/shared/redisCache", () => ({
  cacheOrCompute: async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
}));

import { GET as DASHBOARD } from "@/app/api/dashboard/route";

const ORG_A = "org-aaa";
const USER = "user-1";

function req(days = 30) {
  return new NextRequest(new Request(`http://localhost:3015/api/dashboard?days=${days}`));
}

/**
 * The dashboard fans out a long Promise.all. Only the counts feeding `trends`
 * matter here, so everything else returns an empty shape.
 */
function seed({ cur, prev }: { cur: [number, number, number]; prev: [number, number, number] }) {
  // groupBy is heavily overloaded in Prisma's generated types, so the deep mock
  // surfaces a union no single implementation signature satisfies. Cast the mock.
  (mockDb.psEngagement.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  mockDb.psEngagement.count
    // openRfps/won/lost and the two engagement-count calls share this mock, so
    // order matters: won, lost, then new-this-period, then new-previous-period.
    .mockResolvedValueOnce(3 as never) // won
    .mockResolvedValueOnce(3 as never) // lost
    .mockResolvedValueOnce(cur[0] as never)
    .mockResolvedValueOnce(prev[0] as never);
  mockDb.psRfp.count
    .mockResolvedValueOnce(2 as never) // openRfps
    .mockResolvedValueOnce(cur[2] as never)
    .mockResolvedValueOnce(prev[2] as never);
  (mockDb.psProposal.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  mockDb.psProposal.count
    .mockResolvedValueOnce(cur[1] as never)
    .mockResolvedValueOnce(prev[1] as never);
  mockDb.psDemo.aggregate.mockResolvedValue({ _avg: { feedbackScore: null }, _count: 0 } as never);
  mockDb.psTemplate.count.mockResolvedValue(0 as never);
  mockDb.psDemo.count.mockResolvedValue(0 as never);
  mockDb.psKnowledgeAsset.count.mockResolvedValue(0 as never);
  mockDb.psTimelineEvent.findMany.mockResolvedValue([] as never);
  mockDb.psEngagement.findMany.mockResolvedValue([] as never);
}

beforeEach(() => {
  resetMockDb();
});

describe("dashboard trends", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await DASHBOARD(req(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("computes a rise against the previous window", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seed({ cur: [12, 6, 4], prev: [10, 4, 2] });

    const body = await (await DASHBOARD(req(), { params: {} })).json();

    expect(body.data.trends.newEngagements).toMatchObject({
      current: 12,
      previous: 10,
      deltaPct: 20,
    });
    expect(body.data.trends.newProposals.deltaPct).toBe(50);
    expect(body.data.trends.newRfps.deltaPct).toBe(100);
  });

  it("computes a fall as a negative delta", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seed({ cur: [5, 2, 1], prev: [10, 4, 4] });

    const body = await (await DASHBOARD(req(), { params: {} })).json();

    expect(body.data.trends.newEngagements.deltaPct).toBe(-50);
    expect(body.data.trends.newRfps.deltaPct).toBe(-75);
  });

  it("returns null rather than infinity when the previous window was zero", async () => {
    // "Up from nothing" has no percentage. Rendering ∞ — or a bare 100% — would
    // misstate it, so the UI shows "N new" instead.
    setSession({ id: USER, orgId: ORG_A });
    seed({ cur: [7, 3, 1], prev: [0, 0, 0] });

    const body = await (await DASHBOARD(req(), { params: {} })).json();

    expect(body.data.trends.newEngagements).toMatchObject({
      current: 7,
      previous: 0,
      deltaPct: null,
    });
    expect(body.data.trends.newProposals.deltaPct).toBeNull();
  });

  it("reports zero change as 0, not null", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seed({ cur: [8, 8, 8], prev: [8, 8, 8] });

    const body = await (await DASHBOARD(req(), { params: {} })).json();

    expect(body.data.trends.newEngagements.deltaPct).toBe(0);
  });

  it("exposes no trend for snapshot metrics", async () => {
    // Pipeline value, open count and win rate are snapshots. Comparing them needs
    // historical snapshots nobody records, so they deliberately carry no trend —
    // a fabricated arrow on a leadership dashboard is worse than none.
    setSession({ id: USER, orgId: ORG_A });
    seed({ cur: [1, 1, 1], prev: [1, 1, 1] });

    const body = await (await DASHBOARD(req(), { params: {} })).json();

    expect(Object.keys(body.data.trends).sort()).toEqual([
      "newEngagements",
      "newProposals",
      "newRfps",
    ]);
  });
});
