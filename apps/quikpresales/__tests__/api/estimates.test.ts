import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

import { POST as CREATE } from "@/app/api/estimates/route";
import { PATCH } from "@/app/api/estimates/[id]/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

beforeEach(() => {
  resetMockDb();
});

describe("POST /api/estimates", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await CREATE(
      req("http://localhost:3015/api/estimates", {
        method: "POST",
        body: JSON.stringify({ engagementId: "eng-1", title: "Estimate" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(401);
  });

  it("computes line amounts and the total server-side", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue({ id: "eng-1" } as never);
    mockDb.psCostEstimate.create.mockResolvedValue({
      id: "est-1",
      totalAmount: 0n,
      lines: [],
    } as never);

    await CREATE(
      req("http://localhost:3015/api/estimates", {
        method: "POST",
        body: JSON.stringify({
          engagementId: "eng-1",
          title: "Estimate",
          lines: [
            // ₹10,000/day × 5 days
            { description: "Dev", quantity: 5, rate: "1000000" },
            // ₹8,000/day × 2.5 days
            { description: "QA", quantity: 2.5, rate: "800000" },
          ],
        }),
      }),
      { params: {} },
    );

    const data = mockDb.psCostEstimate.create.mock.calls[0][0].data as {
      totalAmount: bigint;
      orgId: string;
      lines: { create: { amount: bigint }[] };
    };

    expect(data.orgId).toBe(ORG_A);
    expect(data.lines.create[0].amount).toBe(5_000_000n);
    expect(data.lines.create[1].amount).toBe(2_000_000n);
    expect(data.totalAmount).toBe(7_000_000n);
  });

  it("ignores any client-supplied amount or total", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue({ id: "eng-1" } as never);
    mockDb.psCostEstimate.create.mockResolvedValue({ id: "est-1", lines: [] } as never);

    await CREATE(
      req("http://localhost:3015/api/estimates", {
        method: "POST",
        body: JSON.stringify({
          engagementId: "eng-1",
          title: "Estimate",
          totalAmount: "999999999",
          lines: [{ description: "Dev", quantity: 1, rate: "100", amount: "999999999" }],
        }),
      }),
      { params: {} },
    );

    const data = mockDb.psCostEstimate.create.mock.calls[0][0].data as {
      totalAmount: bigint;
      lines: { create: { amount: bigint }[] };
    };
    // Derived from rate × quantity, not from the payload.
    expect(data.lines.create[0].amount).toBe(100n);
    expect(data.totalAmount).toBe(100n);
  });

  it("rejects a non-integral rate", async () => {
    setSession({ id: USER, orgId: ORG_A });
    const res = await CREATE(
      req("http://localhost:3015/api/estimates", {
        method: "POST",
        body: JSON.stringify({
          engagementId: "eng-1",
          title: "Estimate",
          lines: [{ description: "Dev", quantity: 1, rate: "100.50" }],
        }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(400);
  });

  it("404s for an engagement in another org", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psEngagement.findFirst.mockResolvedValue(null);

    const res = await CREATE(
      req("http://localhost:3015/api/estimates", {
        method: "POST",
        body: JSON.stringify({ engagementId: "eng-in-org-a", title: "Estimate" }),
      }),
      { params: {} },
    );

    expect(res.status).toBe(404);
    expect(mockDb.psEngagement.findFirst.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_B });
  });
});

describe("PATCH /api/estimates/[id]", () => {
  it("409s when editing a final estimate without reopening it", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psCostEstimate.findFirst.mockResolvedValue({ id: "est-1", status: "final" } as never);

    const res = await PATCH(
      req("http://localhost:3015/api/estimates/est-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Renamed" }),
      }),
      { params: { id: "est-1" } },
    );

    expect(res.status).toBe(409);
    expect(mockDb.psCostEstimate.update).not.toHaveBeenCalled();
  });

  it("allows reopening a final estimate to draft", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psCostEstimate.findFirst.mockResolvedValue({ id: "est-1", status: "final" } as never);
    mockDb.psCostEstimate.update.mockResolvedValue({ id: "est-1", lines: [] } as never);

    const res = await PATCH(
      req("http://localhost:3015/api/estimates/est-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      }),
      { params: { id: "est-1" } },
    );

    expect(res.status).toBe(200);
  });

  it("recomputes the total when lines are replaced", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psCostEstimate.findFirst.mockResolvedValue({ id: "est-1", status: "draft" } as never);
    mockDb.psCostEstimate.update.mockResolvedValue({ id: "est-1", lines: [] } as never);

    await PATCH(
      req("http://localhost:3015/api/estimates/est-1", {
        method: "PATCH",
        body: JSON.stringify({
          lines: [{ description: "Dev", quantity: 2, rate: "150000" }],
        }),
      }),
      { params: { id: "est-1" } },
    );

    // Old lines cleared, new ones written, total re-derived.
    expect(mockDb.psEstimateLine.deleteMany).toHaveBeenCalledOnce();
    const update = mockDb.psCostEstimate.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(update.totalAmount).toBe(300_000n);
  });
});
