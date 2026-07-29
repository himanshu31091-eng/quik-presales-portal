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

import { GET } from "@/app/api/super/audit/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3006"));
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };

// ─── GET /api/super/audit ────────────────────────────────────────────────────

describe("GET /api/super/audit", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(makeRequest("http://localhost:3006/api/super/audit"));
    expect(res.status).toBe(401);
    const body = await bodyOf(res);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(makeRequest("http://localhost:3006/api/super/audit"));
    expect(res.status).toBe(403);
    const body = await bodyOf(res);
    expect(body).toEqual({ success: false, error: "Super admin access required" });
  });

  it("returns audit log entries on success", async () => {
    setSession(SUPER_ADMIN);

    const mockLogs = [
      {
        id: "log-1",
        action: "create",
        entityType: "tenant",
        entityId: "t-1",
        actorId: "sa-1",
        orgId: "platform",
        createdAt: new Date(),
      },
      {
        id: "log-2",
        action: "update",
        entityType: "user",
        entityId: "u-1",
        actorId: "sa-1",
        orgId: "platform",
        createdAt: new Date(),
      },
    ];

    mockDb.auditLog.findMany.mockResolvedValue(mockLogs as never);
    mockDb.auditLog.count.mockResolvedValue(2 as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/audit"));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(2);
  });

  it("passes filter parameters to query", async () => {
    setSession(SUPER_ADMIN);
    mockDb.auditLog.findMany.mockResolvedValue([] as never);
    mockDb.auditLog.count.mockResolvedValue(0 as never);

    await GET(makeRequest("http://localhost:3006/api/super/audit?action=create&entityType=tenant"));

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: "create",
          entityType: "tenant",
        }),
      }),
    );
  });

  it("applies date range filters", async () => {
    setSession(SUPER_ADMIN);
    mockDb.auditLog.findMany.mockResolvedValue([] as never);
    mockDb.auditLog.count.mockResolvedValue(0 as never);

    await GET(
      makeRequest(
        "http://localhost:3006/api/super/audit?startDate=2024-01-01&endDate=2024-12-31",
      ),
    );

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });
});
