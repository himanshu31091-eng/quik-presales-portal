/**
 * Tests — PATCH /api/super/users/[id]
 *
 * Covers the auth matrix + body validation, 404 on missing user, and the
 * two interesting state transitions (grant/revoke isSuperAdmin) with their
 * audit-log side effects. Also locks in the impersonation-token revocation
 * side effect that fires when a super admin is demoted.
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

import { PATCH } from "@/app/api/super/users/[id]/route";
import { logAudit } from "@/lib/auditLog";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "u-42" } };
const URL_BASE = "http://localhost:3006/api/super/users/u-42";

function patchReq(body: unknown) {
  return makeRequest(URL_BASE, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/super/users/[id]", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await PATCH(patchReq({ firstName: "X" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await PATCH(patchReq({ firstName: "X" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body (firstName too long)", async () => {
    setSession(SUPER_ADMIN);
    const longName = "a".repeat(101);
    const res = await PATCH(patchReq({ firstName: longName }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("returns 404 when target user not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.findUnique.mockResolvedValue(null as never);

    const res = await PATCH(patchReq({ firstName: "Alice" }), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toContain("User not found");
  });

  it("grants super-admin and writes a toggle_super_admin audit log", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.findUnique.mockResolvedValue({
      id: "u-42",
      email: "u42@test.com",
      firstName: "Old",
      lastName: "Name",
      isSuperAdmin: false,
    } as never);
    mockDb.user.update.mockResolvedValue({
      id: "u-42",
      email: "u42@test.com",
      firstName: "Old",
      lastName: "Name",
      isSuperAdmin: true,
    } as never);

    const res = await PATCH(patchReq({ isSuperAdmin: true }), PARAMS);
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.isSuperAdmin).toBe(true);

    const updCall = mockDb.user.update.mock.calls[0]?.[0];
    expect(updCall?.where).toEqual({ id: "u-42" });
    expect(updCall?.data).toEqual({ isSuperAdmin: true });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "toggle_super_admin",
        entityType: "user",
        entityId: "u-42",
        actorId: SUPER_ADMIN.id,
      }),
    );

    // Granting should NOT revoke impersonation tokens
    expect(mockDb.impersonation.updateMany).not.toHaveBeenCalled();
  });

  it("revokes super-admin and expires the demoted user's open impersonation tokens", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.findUnique.mockResolvedValue({
      id: "u-42",
      email: "u42@test.com",
      firstName: "Old",
      lastName: "Name",
      isSuperAdmin: true,
    } as never);
    mockDb.user.update.mockResolvedValue({
      id: "u-42",
      email: "u42@test.com",
      firstName: "Old",
      lastName: "Name",
      isSuperAdmin: false,
    } as never);
    mockDb.impersonation.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await PATCH(patchReq({ isSuperAdmin: false }), PARAMS);
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.data.isSuperAdmin).toBe(false);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "toggle_super_admin",
        entityType: "user",
        entityId: "u-42",
      }),
    );

    expect(mockDb.impersonation.updateMany).toHaveBeenCalledTimes(1);
    const impCall = mockDb.impersonation.updateMany.mock.calls[0]?.[0];
    expect(impCall?.where).toMatchObject({ superAdminId: "u-42", acceptedAt: null });
  });

  it("idempotent revoke: same isSuperAdmin=false already persisted still succeeds", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.findUnique.mockResolvedValue({
      id: "u-42",
      email: "u42@test.com",
      firstName: "Old",
      lastName: "Name",
      isSuperAdmin: false,
    } as never);
    mockDb.user.update.mockResolvedValue({
      id: "u-42",
      email: "u42@test.com",
      firstName: "Old",
      lastName: "Name",
      isSuperAdmin: false,
    } as never);

    const res = await PATCH(patchReq({ isSuperAdmin: false }), PARAMS);
    expect(res.status).toBe(200);

    // Existing wasn't super-admin, so impersonation revoke should NOT run
    expect(mockDb.impersonation.updateMany).not.toHaveBeenCalled();
  });

  it("updates only firstName/lastName when isSuperAdmin is omitted (action = update)", async () => {
    setSession(SUPER_ADMIN);
    mockDb.user.findUnique.mockResolvedValue({
      id: "u-42",
      email: "u42@test.com",
      firstName: "Old",
      lastName: "Name",
      isSuperAdmin: false,
    } as never);
    mockDb.user.update.mockResolvedValue({
      id: "u-42",
      email: "u42@test.com",
      firstName: "New",
      lastName: "Name",
      isSuperAdmin: false,
    } as never);

    const res = await PATCH(patchReq({ firstName: "New" }), PARAMS);
    expect(res.status).toBe(200);

    const updCall = mockDb.user.update.mock.calls[0]?.[0];
    expect(updCall?.data).toEqual({ firstName: "New" });
    expect(updCall?.data).not.toHaveProperty("isSuperAdmin");

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        entityType: "user",
        entityId: "u-42",
      }),
    );
  });
});
