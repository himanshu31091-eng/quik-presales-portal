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
  sendMemberAddedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/super/users/bulk/route";
import { logAudit } from "@/lib/auditLog";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };

function postReq(body: unknown) {
  return makeRequest("http://localhost:3006/api/super/users/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/super/users/bulk", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(postReq({ action: "grant_super_admin", ids: ["u-1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(postReq({ action: "grant_super_admin", ids: ["u-1"] }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when action is missing", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(postReq({ ids: ["u-1"] }));
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toContain("action and ids");
  });

  it("returns 400 when ids is empty array", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(postReq({ action: "grant_super_admin", ids: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids is not an array", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(postReq({ action: "grant_super_admin", ids: "u-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is unknown", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(postReq({ action: "delete_everything", ids: ["u-1"] }));
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toContain("action must be");
  });

  it("returns 400 when more than 100 ids are supplied", async () => {
    setSession(SUPER_ADMIN);
    const ids = Array.from({ length: 101 }, (_, i) => `u-${i}`);
    const res = await POST(postReq({ action: "grant_super_admin", ids }));
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toContain("Maximum 100");
  });

  it("grants super admin and writes one audit log per id", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.updateMany.mockResolvedValue({ count: 2 } as never);

    const res = await POST(postReq({ action: "grant_super_admin", ids: ["u-1", "u-2"] }));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ requested: 2, updated: 2 });

    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-1", "u-2"] } },
      data: { isSuperAdmin: true },
    });
    expect(logAudit).toHaveBeenCalledTimes(2);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "toggle_super_admin",
        entityType: "user",
        entityId: "u-1",
      }),
    );
  });

  it("revokes super admin and reports skipped when DB updated fewer than requested", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(postReq({ action: "revoke_super_admin", ids: ["u-1", "u-2"] }));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.data).toMatchObject({ requested: 2, updated: 1, skipped: 1 });

    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-1", "u-2"] } },
      data: { isSuperAdmin: false },
    });
  });
});
