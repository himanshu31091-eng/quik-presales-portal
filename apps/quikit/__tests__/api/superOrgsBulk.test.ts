import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/super/orgs/bulk/route";

const SUPER_ADMIN = "sa-001";

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/super/orgs/bulk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asSuperAdmin() {
  setSession({ id: SUPER_ADMIN, orgId: "any", role: "super_admin" });
  mockDb.user.findUnique.mockResolvedValue({
    id: SUPER_ADMIN,
    isSuperAdmin: true,
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// POST /api/super/orgs/bulk — auth
// ═══════════════════════════════════════════════

describe("POST /api/super/orgs/bulk — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ action: "suspend", ids: ["t1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession({ id: "regular", orgId: "t1", role: "member" });
    mockDb.user.findUnique.mockResolvedValue({ id: "regular", isSuperAdmin: false } as any);
    const res = await POST(buildPOST({ action: "suspend", ids: ["t1"] }));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/orgs/bulk — validation
// ═══════════════════════════════════════════════

describe("POST /api/super/orgs/bulk — validation", () => {
  beforeEach(asSuperAdmin);

  it("returns 400 when action is missing", async () => {
    const res = await POST(buildPOST({ ids: ["t1"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns 400 when ids is empty", async () => {
    const res = await POST(buildPOST({ action: "suspend", ids: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids is not an array", async () => {
    const res = await POST(buildPOST({ action: "suspend", ids: "t1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid action", async () => {
    const res = await POST(buildPOST({ action: "delete", ids: ["t1"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("suspend");
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/orgs/bulk — happy path
// ═══════════════════════════════════════════════

describe("POST /api/super/orgs/bulk — happy path", () => {
  beforeEach(asSuperAdmin);

  it("suspends multiple orgs", async () => {
    mockDb.org.updateMany.mockResolvedValue({ count: 3 } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST({ action: "suspend", ids: ["t1", "t2", "t3"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("3");

    expect(mockDb.org.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["t1", "t2", "t3"] } },
        data: { status: "suspended" },
      })
    );
  });

  it("activates multiple orgs", async () => {
    mockDb.org.updateMany.mockResolvedValue({ count: 2 } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST({ action: "activate", ids: ["t1", "t2"] }));
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(mockDb.org.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "active" },
      })
    );
  });
});
