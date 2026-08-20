import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

// Reports caches through Redis; bypass it so each case computes fresh.
vi.mock("@quikit/shared/redisCache", () => ({
  cacheOrCompute: async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
}));

import { GET as REPORTS } from "@/app/api/reports/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

function req(months = 6) {
  return new NextRequest(new Request(`http://localhost:3015/api/reports?months=${months}`));
}

/** Every query computeReportsData fans out, stubbed to an empty/neutral shape. */
function seedEmpty() {
  (mockDb.psEngagement.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  mockDb.psEngagement.findMany.mockResolvedValue([] as never);
  (mockDb.psWinLoss.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  mockDb.psWinLoss.findMany.mockResolvedValue([] as never);
  mockDb.psProposal.findMany.mockResolvedValue([] as never);
  (mockDb.psDemo.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
}

beforeEach(() => {
  resetMockDb();
});

describe("GET /api/reports", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await REPORTS(req(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("scopes every fan-out query to the caller's org", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seedEmpty();

    await REPORTS(req(), { params: {} });

    expect(mockDb.psEngagement.groupBy).toHaveBeenCalled();
    for (const call of (mockDb.psEngagement.groupBy as unknown as { mock: { calls: unknown[][] } }).mock.calls) {
      expect((call[0] as { where: { orgId: string } }).where.orgId).toBe(ORG_A);
    }
    for (const call of (mockDb.psWinLoss.groupBy as unknown as { mock: { calls: unknown[][] } }).mock.calls) {
      expect((call[0] as { where: { orgId: string } }).where.orgId).toBe(ORG_A);
    }
    expect(mockDb.psWinLoss.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: ORG_A }) }),
    );
    // A second org's session must never leak into the same query shape.
    expect(mockDb.psWinLoss.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: ORG_B }) }),
    );
  });

  it("computes win rate, revenue and forecast from real rows", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seedEmpty();

    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));

    // One won deal (₹10,00,000 dealSize) and one lost deal this month.
    mockDb.psWinLoss.findMany.mockResolvedValue([
      {
        outcome: "won",
        createdAt: thisMonth,
        dealSize: 100_000_00n,
        engagement: { estRevenue: 80_000_00n, currency: "INR" },
      },
      {
        outcome: "lost",
        createdAt: thisMonth,
        dealSize: null,
        engagement: { estRevenue: 50_000_00n, currency: "INR" },
      },
    ] as never);
    (mockDb.psWinLoss.groupBy as unknown as { mockImplementation: (fn: (args: unknown) => unknown) => void }).mockImplementation(
      (args: unknown) => {
        const by = (args as { by: string[] }).by;
        if (by.includes("outcome")) {
          return Promise.resolve([
            { outcome: "won", _count: 1 },
            { outcome: "lost", _count: 1 },
          ]);
        }
        return Promise.resolve([]);
      },
    );

    // One open deal closing next month, 50% probability, ₹20,00,000 value —
    // forecast should weight it to ₹10,00,000.
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 10));
    // findMany is heavily overloaded in Prisma's generated types, so the deep
    // mock surfaces a union no single implementation signature satisfies.
    (mockDb.psEngagement.findMany as unknown as { mockImplementation: (fn: (args: unknown) => unknown) => void }).mockImplementation(
      (args: unknown) => {
        const where = (args as { where: Record<string, unknown> }).where;
        if (where.expectedClose) {
          return Promise.resolve([
            { estRevenue: 2_000_000_00n, currency: "INR", probability: 50, expectedClose: nextMonth },
          ]);
        }
        return Promise.resolve([]);
      },
    );

    const body = await (await REPORTS(req(6), { params: {} })).json();

    expect(body.data.winRate.overall).toMatchObject({ won: 1, lost: 1, winRatePct: 50 });

    const thisMonthRevenue = body.data.revenue.trend.at(-1);
    expect(thisMonthRevenue.money).toEqual([{ currency: "INR", minorUnits: "10000000" }]);

    const nextMonthForecast = body.data.forecast.trend[1];
    expect(nextMonthForecast.money).toEqual([{ currency: "INR", minorUnits: "100000000" }]);
  });

  it("reports null win rate and null turnaround when there is no data yet", async () => {
    setSession({ id: USER, orgId: ORG_A });
    seedEmpty();

    const body = await (await REPORTS(req(), { params: {} })).json();

    expect(body.data.winRate.overall.winRatePct).toBeNull();
    expect(body.data.proposalTurnaround.overall.avgHours).toBeNull();
    expect(body.data.demoPerformance).toEqual([]);
  });
});
