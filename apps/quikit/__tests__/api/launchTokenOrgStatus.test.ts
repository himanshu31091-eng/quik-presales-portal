import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

import { POST } from "@/app/api/launch-token/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://localhost:3006/api/launch-token"), {
    method: "POST",
    body: JSON.stringify(body),
  } as never);
}

const ACTIVE_APP = { id: "app-1", slug: "quikscale", status: "active", requiresOrgAdmin: false };
const MEMBER = { id: "u-1", email: "member@test.com", isSuperAdmin: false, orgId: "org-1" };

// ─── Regression: org suspension blocks app launches ─────────────────────────

describe("POST /api/launch-token — org.status enforcement", () => {
  beforeEach(() => {
    resetMockDb();
    mockDb.app.findUnique.mockResolvedValue(ACTIVE_APP as never);
  });

  it("returns 403 + ORG_SUSPENDED for a member whose org is suspended", async () => {
    setSession(MEMBER);
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "member",
      org: { status: "suspended" },
    } as never);

    const res = await POST(makeRequest({ appSlug: "quikscale", orgId: "org-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ORG_SUSPENDED");
    expect(body.error).toContain("suspended");
  });

  it("returns the generic 'Not a member' error for a genuine non-member", async () => {
    setSession(MEMBER);
    mockDb.orgMember.findFirst.mockResolvedValue(null as never);

    const res = await POST(makeRequest({ appSlug: "quikscale", orgId: "org-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBeUndefined();
    expect(body.error).toBe("Not a member of this organisation");
  });

  it("fetches the org status alongside the membership", async () => {
    setSession(MEMBER);
    mockDb.orgMember.findFirst.mockResolvedValue(null as never);

    await POST(makeRequest({ appSlug: "quikscale", orgId: "org-1" }));

    expect(mockDb.orgMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u-1", orgId: "org-1", status: "active" }),
        select: expect.objectContaining({ org: { select: { status: true } } }),
      }),
    );
  });

  it("lets an active-org member past the suspension gate", async () => {
    setSession(MEMBER);
    // Active org → passes the gate and proceeds to the app-enablement check
    // (which fails here, proving the gate was cleared).
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "member",
      org: { status: "active" },
    } as never);
    mockDb.orgAppAccess.findFirst.mockResolvedValue(null as never);

    const res = await POST(makeRequest({ appSlug: "quikscale", orgId: "org-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("App not enabled for this org");
  });
});
