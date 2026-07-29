import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession, setPermissionGate } from "../setup";

import { POST as CREATE } from "@/app/api/proposals/route";
import { POST as VERSION } from "@/app/api/proposals/[id]/versions/route";
import { POST as TRANSITION } from "@/app/api/proposals/[id]/transition/route";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER = "user-1";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

beforeEach(() => {
  resetMockDb();
});

describe("POST /api/proposals", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await CREATE(
      req("http://localhost:3015/api/proposals", {
        method: "POST",
        body: JSON.stringify({ engagementId: "eng-1", title: "Proposal" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(401);
  });

  it("404s when the engagement belongs to another org", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psEngagement.findFirst.mockResolvedValue(null);

    const res = await CREATE(
      req("http://localhost:3015/api/proposals", {
        method: "POST",
        body: JSON.stringify({ engagementId: "eng-in-org-a", title: "Proposal" }),
      }),
      { params: {} },
    );

    expect(res.status).toBe(404);
    expect(mockDb.psEngagement.findFirst.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_B });
    expect(mockDb.psProposal.create).not.toHaveBeenCalled();
  });

  it("creates a v1 immediately so currentVersionId is never null", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psEngagement.findFirst.mockResolvedValue({ id: "eng-1" } as never);
    mockDb.psProposal.create.mockResolvedValue({ id: "prop-1" } as never);
    mockDb.psProposalVersion.create.mockResolvedValue({ id: "ver-1" } as never);
    mockDb.psProposal.update.mockResolvedValue({ id: "prop-1", title: "Proposal" } as never);

    const res = await CREATE(
      req("http://localhost:3015/api/proposals", {
        method: "POST",
        body: JSON.stringify({ engagementId: "eng-1", title: "Proposal" }),
      }),
      { params: {} },
    );

    expect(res.status).toBe(201);

    const version = mockDb.psProposalVersion.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(version).toMatchObject({ orgId: ORG_A, proposalId: "prop-1", version: 1 });
    expect(Array.isArray(version.sections)).toBe(true);

    // The proposal is pointed at its first version in the same transaction.
    expect(mockDb.psProposal.update.mock.calls[0][0].data).toMatchObject({
      currentVersionId: "ver-1",
    });
  });
});

describe("POST /api/proposals/[id]/versions", () => {
  it("increments the version number and sanitises section html", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psProposal.findFirst.mockResolvedValue({ id: "prop-1" } as never);
    mockDb.psProposalVersion.findFirst.mockResolvedValue({ version: 4 } as never);
    mockDb.psProposalVersion.create.mockResolvedValue({
      id: "ver-5",
      version: 5,
      sections: [],
    } as never);

    const res = await VERSION(
      req("http://localhost:3015/api/proposals/prop-1/versions", {
        method: "POST",
        body: JSON.stringify({
          sections: [
            { slug: "a", title: "A", html: "<p>keep</p><script>alert(1)</script>" },
          ],
          source: "edit",
        }),
      }),
      { params: { id: "prop-1" } },
    );

    expect(res.status).toBe(201);

    // `sections` is typed as Prisma's InputJsonValue, so narrow through unknown.
    const created = mockDb.psProposalVersion.create.mock.calls[0][0].data as unknown as {
      version: number;
      sections: { html: string }[];
    };
    expect(created.version).toBe(5);
    expect(created.sections[0].html).toBe("<p>keep</p>");
    expect(created.sections[0].html).not.toContain("script");
  });

  it("rejects an empty section list", async () => {
    setSession({ id: USER, orgId: ORG_A });
    const res = await VERSION(
      req("http://localhost:3015/api/proposals/prop-1/versions", {
        method: "POST",
        body: JSON.stringify({ sections: [] }),
      }),
      { params: { id: "prop-1" } },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/proposals/[id]/transition", () => {
  it("requires the approve grant to reach `approved`", async () => {
    setSession({ id: USER, orgId: ORG_A });
    setPermissionGate(false);

    const res = await TRANSITION(
      req("http://localhost:3015/api/proposals/prop-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStatus: "approved" }),
      }),
      { params: { id: "prop-1" } },
    );

    expect(res.status).toBe(403);
    // Permission is checked before the row is loaded, so a denied caller
    // can't even probe whether the proposal exists.
    expect(mockDb.psProposal.findFirst).not.toHaveBeenCalled();
  });

  it("refuses to approve a proposal with no content", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psProposal.findFirst.mockResolvedValue({
      id: "prop-1",
      title: "P",
      status: "internal-review",
      engagementId: "eng-1",
      currentVersionId: null,
    } as never);

    const res = await TRANSITION(
      req("http://localhost:3015/api/proposals/prop-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStatus: "approved" }),
      }),
      { params: { id: "prop-1" } },
    );

    expect(res.status).toBe(409);
    expect(mockDb.psProposal.update).not.toHaveBeenCalled();
  });

  it("stamps the approver when approving", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psProposal.findFirst.mockResolvedValue({
      id: "prop-1",
      title: "P",
      status: "internal-review",
      engagementId: "eng-1",
      currentVersionId: "ver-1",
    } as never);

    const res = await TRANSITION(
      req("http://localhost:3015/api/proposals/prop-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStatus: "approved" }),
      }),
      { params: { id: "prop-1" } },
    );

    expect(res.status).toBe(200);
    const update = mockDb.psProposal.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(update.status).toBe("approved");
    expect(update.approvedById).toBe(USER);
    expect(update.approvedAt).toBeInstanceOf(Date);
  });

  it("clears the approval stamp when sent back to draft", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.psProposal.findFirst.mockResolvedValue({
      id: "prop-1",
      title: "P",
      status: "approved",
      engagementId: "eng-1",
      currentVersionId: "ver-1",
    } as never);

    // approved → customer-review is the legal backward move.
    await TRANSITION(
      req("http://localhost:3015/api/proposals/prop-1/transition", {
        method: "POST",
        body: JSON.stringify({ toStatus: "customer-review" }),
      }),
      { params: { id: "prop-1" } },
    );

    const update = mockDb.psProposal.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(update.approvedAt).toBeNull();
    expect(update.approvedById).toBeNull();
  });

  it("404s across the org boundary", async () => {
    setSession({ id: USER, orgId: ORG_B });
    mockDb.psProposal.findFirst.mockResolvedValue(null);

    const res = await TRANSITION(
      req("http://localhost:3015/api/proposals/prop-in-org-a/transition", {
        method: "POST",
        body: JSON.stringify({ toStatus: "internal-review" }),
      }),
      { params: { id: "prop-in-org-a" } },
    );

    expect(res.status).toBe(404);
    expect(mockDb.psProposal.findFirst.mock.calls[0][0]?.where).toMatchObject({ orgId: ORG_B });
  });
});
