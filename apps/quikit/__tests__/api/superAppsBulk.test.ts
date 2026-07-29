/**
 * Smoke tests — POST /api/super/apps/bulk
 * Auth matrix, happy path for one action, and one invalid-body case.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendUserCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgSuspendedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/super/apps/bulk/route";

function postReq(body: unknown) {
  return new NextRequest(new URL("/api/super/apps/bulk", "http://localhost:3006"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  } as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };

describe("POST /api/super/apps/bulk", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(postReq({ action: "disable", ids: ["app-1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(postReq({ action: "disable", ids: ["app-1"] }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when action is unknown", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(postReq({ action: "nuke", ids: ["app-1"] }));
    expect(res.status).toBe(400);
  });

  it("disables apps on happy path", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.updateMany.mockResolvedValue({ count: 2 } as never);

    const res = await POST(postReq({ action: "disable", ids: ["app-1", "app-2"] }));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ requested: 2, updated: 2 });

    expect(mockDb.app.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["app-1", "app-2"] } },
      data: { status: "disabled" },
    });
  });
});
