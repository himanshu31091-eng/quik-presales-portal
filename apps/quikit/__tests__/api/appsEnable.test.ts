import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

import { POST } from "@/app/api/apps/enable/route";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function makeRequest(body: unknown) {
  return new NextRequest(new URL("/api/apps/enable", "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  } as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const ADMIN = { id: "admin-1", email: "admin@test.com", orgId: "tenant-1" };
const MEMBER = { id: "member-1", email: "m@test.com", orgId: "tenant-1" };

/* ─── Tests ───────────────────────────────────────────────────────────────── */

describe("POST /api/apps/enable — bulk access grant", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(makeRequest({ appId: "app-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when session has no orgId", async () => {
    setSession({ id: "u-1" });
    const res = await POST(makeRequest({ appId: "app-1" }));
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).error).toMatch(/No org selected/i);
  });

  it("returns 403 for non-admin member", async () => {
    setSession(MEMBER);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);

    const res = await POST(makeRequest({ appId: "app-1" }));
    expect(res.status).toBe(403);
    expect((await bodyOf(res)).error).toMatch(/admin/i);
  });

  it("returns 400 when appId missing", async () => {
    setSession(ADMIN);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when app does not exist", async () => {
    setSession(ADMIN);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.app.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ appId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("bulk-grants access in a single createMany call", async () => {
    setSession(ADMIN);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);

    const members = Array.from({ length: 500 }, (_, i) => ({
      userId: `u-${i}`,
    }));
    mockDb.orgMember.findMany.mockResolvedValue(members as never);
    mockDb.userAppAccess.createMany.mockResolvedValue({ count: 500 } as never);

    const res = await POST(makeRequest({ appId: "app-1" }));
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      appId: "app-1",
      membersGranted: 500,
      totalEligibleMembers: 500,
    });

    // Critical regression guard: exactly one bulk insert, with skipDuplicates.
    expect(mockDb.userAppAccess.createMany).toHaveBeenCalledTimes(1);
    expect(mockDb.userAppAccess.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true,
    });
    const call = mockDb.userAppAccess.createMany.mock.calls[0]?.[0];
    const callData = call?.data as Array<Record<string, unknown>>;
    expect(callData).toHaveLength(500);
    expect(callData[0]).toEqual({
      userId: "u-0",
      orgId: "tenant-1",
      appId: "app-1",
      role: "member",
      grantedBy: ADMIN.id,
    });

    // And the old N+1 shape is gone.
    expect(mockDb.userAppAccess.findUnique).not.toHaveBeenCalled();
    expect(mockDb.userAppAccess.create).not.toHaveBeenCalled();
  });

  it("reports partial grants when some members already have access", async () => {
    setSession(ADMIN);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);

    const members = Array.from({ length: 10 }, (_, i) => ({
      userId: `u-${i}`,
    }));
    mockDb.orgMember.findMany.mockResolvedValue(members as never);
    // 7 new, 3 already had access (skipDuplicates skipped them)
    mockDb.userAppAccess.createMany.mockResolvedValue({ count: 7 } as never);

    const res = await POST(makeRequest({ appId: "app-1" }));
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.data).toEqual({
      appId: "app-1",
      membersGranted: 7,
      totalEligibleMembers: 10,
    });
  });

  it("handles empty-tenant gracefully without crashing", async () => {
    setSession(ADMIN);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);
    mockDb.orgMember.findMany.mockResolvedValue([]);
    mockDb.userAppAccess.createMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(makeRequest({ appId: "app-1" }));
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.data).toEqual({
      appId: "app-1",
      membersGranted: 0,
      totalEligibleMembers: 0,
    });
  });

  it("is idempotent — second call on same tenant/app grants 0 new", async () => {
    setSession(ADMIN);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);
    mockDb.orgMember.findMany.mockResolvedValue([
      { userId: "u-1" },
      { userId: "u-2" },
    ] as never);
    // All members already had access — skipDuplicates skipped them all.
    mockDb.userAppAccess.createMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(makeRequest({ appId: "app-1" }));
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).data.membersGranted).toBe(0);
  });
});
