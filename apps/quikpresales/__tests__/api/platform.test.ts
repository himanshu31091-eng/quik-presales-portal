import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

import { GET as SETTINGS_GET, PATCH as SETTINGS_PATCH } from "@/app/api/settings/company/route";
import { GET as ORG_INFO } from "@/app/api/org/info/route";
import { GET as SWITCHER } from "@/app/api/apps/switcher/route";
import { GET as VALIDATE } from "@/app/api/session/validate/route";
import { GET as METRICS } from "@/app/api/metrics/route";

const ORG_A = "org-aaa";
const USER = "user-1";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

beforeEach(() => {
  resetMockDb();
});

/**
 * ThemeApplier calls this on mount in every app. If the contract drifts,
 * accent theming silently dies — which is exactly the bug these cover.
 */
describe("GET /api/settings/company (ThemeApplier contract)", () => {
  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await SETTINGS_GET(req("http://localhost:3015/api/settings/company"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns { success, data: { accentColor, themeMode } }", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.user.findUnique.mockResolvedValue({
      accentColor: "#6366f1",
      themeMode: "light",
    } as never);

    const res = await SETTINGS_GET(req("http://localhost:3015/api/settings/company"), { params: {} });
    expect(res.status).toBe(200);
    // Shape is load-bearing: ThemeApplier reads json.data.accentColor.
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { accentColor: "#6366f1", themeMode: "light" },
    });
  });

  it("reads the caller's own row, never another user's", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.user.findUnique.mockResolvedValue({ accentColor: null, themeMode: null } as never);
    await SETTINGS_GET(req("http://localhost:3015/api/settings/company"), { params: {} });
    expect(mockDb.user.findUnique.mock.calls[0][0].where).toEqual({ id: USER });
  });

  it("rejects a malformed accent colour", async () => {
    setSession({ id: USER, orgId: ORG_A });
    const res = await SETTINGS_PATCH(
      req("http://localhost:3015/api/settings/company", {
        method: "PATCH",
        body: JSON.stringify({ accentColor: "red" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(400);
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("persists a valid accent colour for the caller", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.user.update.mockResolvedValue({ accentColor: "#0d9488", themeMode: "light" } as never);
    const res = await SETTINGS_PATCH(
      req("http://localhost:3015/api/settings/company", {
        method: "PATCH",
        body: JSON.stringify({ accentColor: "#0d9488" }),
      }),
      { params: {} },
    );
    expect(res.status).toBe(200);
    expect(mockDb.user.update.mock.calls[0][0].where).toEqual({ id: USER });
  });
});

describe("GET /api/org/info", () => {
  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await ORG_INFO(req("http://localhost:3015/api/org/info"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns only the caller's own org", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.org.findUnique.mockResolvedValue({ id: ORG_A, name: "MoreYeahs", slug: "my" } as never);
    const res = await ORG_INFO(req("http://localhost:3015/api/org/info"), { params: {} });
    expect(res.status).toBe(200);
    expect(mockDb.org.findUnique.mock.calls[0][0].where).toEqual({ id: ORG_A });
  });
});

describe("GET /api/apps/switcher", () => {
  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await SWITCHER();
    expect(res.status).toBe(401);
  });

  it("hides apps the org has no OrgAppAccess row for", async () => {
    setSession({ id: USER, orgId: ORG_A, membershipRole: "member" });
    mockDb.app.findMany.mockResolvedValue([
      { id: "app-1", slug: "quikscale", name: "QuikScale", description: null, iconUrl: null,
        baseUrl: "http://localhost:3003", status: "active", requiresOrgAdmin: false },
      { id: "app-2", slug: "quikvc", name: "QuikVC", description: null, iconUrl: null,
        baseUrl: "http://localhost:3005", status: "active", requiresOrgAdmin: false },
    ] as never);
    // Org is entitled to app-1 only.
    mockDb.orgAppAccess.findMany.mockResolvedValue([{ appId: "app-1" }] as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ appId: "app-1" }] as never);

    const res = await SWITCHER();
    const body = (await res.json()) as { data: { slug: string }[] };
    expect(body.data.map((a) => a.slug)).toEqual(["quikscale"]);
  });

  it("hides requiresOrgAdmin apps from non-admins but shows them to org admins", async () => {
    const catalog = [
      { id: "app-1", slug: "admin", name: "Admin", description: null, iconUrl: null,
        baseUrl: "http://localhost:3002", status: "active", requiresOrgAdmin: true },
    ];
    mockDb.app.findMany.mockResolvedValue(catalog as never);
    mockDb.orgAppAccess.findMany.mockResolvedValue([{ appId: "app-1" }] as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([] as never);

    setSession({ id: USER, orgId: ORG_A, membershipRole: "member" });
    let body = (await (await SWITCHER()).json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);

    // Org admins see every provisioned app without a UserAppAccess row.
    setSession({ id: USER, orgId: ORG_A, membershipRole: "org_admin" });
    body = (await (await SWITCHER()).json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});

describe("GET /api/session/validate", () => {
  it("reports unauthenticated without a session", async () => {
    setSession(null);
    const res = await VALIDATE(req("http://localhost:3015/api/session/validate"));
    await expect(res.json()).resolves.toMatchObject({ valid: false, reason: "unauthenticated" });
  });

  it("reports deactivated when the membership is gone", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.orgMember.findFirst.mockResolvedValue(null);
    const res = await VALIDATE(req("http://localhost:3015/api/session/validate"));
    await expect(res.json()).resolves.toMatchObject({ valid: false, reason: "deactivated" });
  });

  it("reports org_suspended distinctly from deactivated", async () => {
    setSession({ id: USER, orgId: ORG_A });
    mockDb.orgMember.findFirst.mockResolvedValue({
      id: "m1", org: { status: "suspended" },
    } as never);
    const res = await VALIDATE(req("http://localhost:3015/api/session/validate"));
    // The client routes these two to different places, so they must not collapse.
    await expect(res.json()).resolves.toMatchObject({ valid: false, reason: "org_suspended" });
  });

  it("reports app_access_revoked when the org lost the app", async () => {
    setSession({ id: USER, orgId: ORG_A, membershipRole: "org_admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ id: "m1", org: { status: "active" } } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-ps" } as never);
    mockDb.orgAppAccess.findUnique.mockResolvedValue({ enabled: false, trialEndsAt: null } as never);

    const res = await VALIDATE(req("http://localhost:3015/api/session/validate"));
    await expect(res.json()).resolves.toMatchObject({ valid: false, reason: "app_access_revoked" });
  });

  it("reports app_access_revoked when the trial has lapsed", async () => {
    setSession({ id: USER, orgId: ORG_A, membershipRole: "org_admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ id: "m1", org: { status: "active" } } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-ps" } as never);
    mockDb.orgAppAccess.findUnique.mockResolvedValue({
      enabled: true,
      trialEndsAt: new Date(Date.now() - 1000),
    } as never);

    const res = await VALIDATE(req("http://localhost:3015/api/session/validate"));
    await expect(res.json()).resolves.toMatchObject({ valid: false, reason: "app_access_revoked" });
  });

  it("is valid for an entitled org admin", async () => {
    setSession({ id: USER, orgId: ORG_A, membershipRole: "org_admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ id: "m1", org: { status: "active" } } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-ps" } as never);
    mockDb.orgAppAccess.findUnique.mockResolvedValue({ enabled: true, trialEndsAt: null } as never);

    const res = await VALIDATE(req("http://localhost:3015/api/session/validate"));
    await expect(res.json()).resolves.toEqual({ valid: true });
    // Admin tier passes on org-level access alone — no UserAppAccess lookup.
    expect(mockDb.userAppAccess.findUnique).not.toHaveBeenCalled();
  });
});

describe("GET /api/metrics", () => {
  it("fails closed with 403 when METRICS_TOKEN is unset", async () => {
    delete process.env.METRICS_TOKEN;
    const res = await METRICS(req("http://localhost:3015/api/metrics"));
    expect(res.status).toBe(403);
  });

  it("401s on a wrong bearer token", async () => {
    process.env.METRICS_TOKEN = "secret";
    const res = await METRICS(
      req("http://localhost:3015/api/metrics", { headers: { authorization: "Bearer nope" } }),
    );
    expect(res.status).toBe(401);
    delete process.env.METRICS_TOKEN;
  });
});
