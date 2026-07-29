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

import { POST } from "@/app/api/super/feature-flags/[appSlug]/toggle/route";
import { logAudit } from "@/lib/auditLog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { appSlug: "quikscale" } };

function postReq(body: unknown) {
  return makeRequest(
    "http://localhost:3006/api/super/feature-flags/quikscale/toggle",
    { method: "POST", body: JSON.stringify(body) },
  );
}

// ─── POST /api/super/feature-flags/[appSlug]/toggle ──────────────────────────

describe("POST /api/super/feature-flags/[appSlug]/toggle", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "people.talent", enabled: false }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "people.talent", enabled: false }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown appSlug", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "foo", enabled: false }),
      { params: { appSlug: "bogus" } },
    );
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("Unknown app");
  });

  it("returns 400 for invalid body (missing orgId)", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      postReq({ moduleKey: "people.talent", enabled: false }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid body (enabled not boolean)", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "people.talent", enabled: "no" }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when app is not registered in database", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue(null as never);

    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "people.talent", enabled: false }),
      PARAMS,
    );
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("App not registered in database");
  });

  it("returns 404 when tenant not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);
    mockDb.org.findUnique.mockResolvedValue(null as never);

    const res = await POST(
      postReq({ orgId: "t-missing", moduleKey: "people.talent", enabled: false }),
      PARAMS,
    );
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("Organization not found");
  });

  it("disables a module by upserting a row and writes audit log", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);
    mockDb.org.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    mockDb.appModuleFlag.upsert.mockResolvedValue({} as never);

    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "people.talent", enabled: false }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      orgId: "t-1",
      moduleKey: "people.talent",
      enabled: false,
    });

    expect(mockDb.appModuleFlag.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.appModuleFlag.deleteMany).not.toHaveBeenCalled();

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feature_flag_disabled",
        entityType: "AppModuleFlag",
        entityId: "quikscale/people.talent",
        orgId: "t-1",
      }),
    );
  });

  it("enables a module by deleting the override row and writes audit log", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);
    mockDb.org.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    mockDb.appModuleFlag.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "people.talent", enabled: true }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.data.enabled).toBe(true);

    expect(mockDb.appModuleFlag.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockDb.appModuleFlag.upsert).not.toHaveBeenCalled();

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "feature_flag_enabled" }),
    );
  });

  it("enables a default-off module (cash) by upserting an enabled:true override", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);
    mockDb.org.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    mockDb.appModuleFlag.upsert.mockResolvedValue({} as never);

    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "cash", enabled: true }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    // Default-off modules invert the convention: the row exists to ENABLE.
    expect(mockDb.appModuleFlag.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.appModuleFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ moduleKey: "cash", enabled: true }),
        update: expect.objectContaining({ enabled: true }),
      }),
    );
    expect(mockDb.appModuleFlag.deleteMany).not.toHaveBeenCalled();
  });

  it("disables a default-off module (survey) by deleting its override row", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1" } as never);
    mockDb.org.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    mockDb.appModuleFlag.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(
      postReq({ orgId: "t-1", moduleKey: "survey", enabled: false }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(mockDb.appModuleFlag.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockDb.appModuleFlag.upsert).not.toHaveBeenCalled();
  });
});
