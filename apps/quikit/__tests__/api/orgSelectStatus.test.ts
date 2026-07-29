import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

import { POST } from "@/app/api/org/select/route";

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://localhost:3006/api/org/select"), {
    method: "POST",
    body: JSON.stringify(body),
  } as never);
}

const USER = { id: "u-1", email: "user@test.com", isSuperAdmin: false };

describe("POST /api/org/select — org.status enforcement", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 403 when selecting a suspended org", async () => {
    setSession(USER);
    // Suspended org → `org: { status: "active" }` filters the row out.
    mockDb.orgMember.findFirst.mockResolvedValue(null as never);

    const res = await POST(makeRequest({ orgId: "org-1" }));
    expect(res.status).toBe(403);
  });

  it("scopes the lookup to active (non-suspended) orgs", async () => {
    setSession(USER);
    mockDb.orgMember.findFirst.mockResolvedValue(null as never);

    await POST(makeRequest({ orgId: "org-1" }));

    expect(mockDb.orgMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u-1",
          orgId: "org-1",
          status: "active",
          org: { status: "active" },
        }),
      }),
    );
  });

  it("allows selecting an active org", async () => {
    setSession(USER);
    mockDb.orgMember.findFirst.mockResolvedValue({ orgId: "org-1", role: "member" } as never);

    const res = await POST(makeRequest({ orgId: "org-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.orgId).toBe("org-1");
  });
});
