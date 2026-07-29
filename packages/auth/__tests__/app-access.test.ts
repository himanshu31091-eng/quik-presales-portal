import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the shared Prisma client the helper imports.
const db = {
  app: { findUnique: vi.fn(), findMany: vi.fn() },
  orgAppAccess: { findMany: vi.fn() },
  userAppAccess: { findMany: vi.fn() },
};
vi.mock("@quikit/database", () => ({ db }));

import { getAppAccess } from "../app-access";

const APPS = {
  quikscale: { id: "app-scale", requiresOrgAdmin: false },
  quiktrack: { id: "app-track", requiresOrgAdmin: false },
  admin: { id: "app-admin", requiresOrgAdmin: true },
};

function seed(opts: {
  orgEnabled: { appId: string; trialEndsAt?: Date | null }[];
  userApps: string[];
}) {
  db.app.findMany.mockResolvedValue(
    Object.values(APPS).map((a) => ({ id: a.id, requiresOrgAdmin: a.requiresOrgAdmin })),
  );
  db.orgAppAccess.findMany.mockResolvedValue(
    opts.orgEnabled.map((o) => ({ appId: o.appId, trialEndsAt: o.trialEndsAt ?? null })),
  );
  db.userAppAccess.findMany.mockResolvedValue(opts.userApps.map((appId) => ({ appId })));
}

const BASE = { userId: "u1", orgId: "org1", isSuperAdmin: false, memberRole: "member" };

describe("getAppAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies a non-admin without a UserAppAccess row, and counts the one other app they DO have", async () => {
    db.app.findUnique.mockResolvedValue(APPS.quikscale); // the app being opened
    seed({
      orgEnabled: [{ appId: APPS.quikscale.id }, { appId: APPS.quiktrack.id }, { appId: APPS.admin.id }],
      userApps: [APPS.quiktrack.id], // only quiktrack granted
    });

    const res = await getAppAccess({ ...BASE, appSlug: "quikscale" });
    expect(res.hasAccess).toBe(false);
    expect(res.otherAppsCount).toBe(1); // quiktrack (admin app excluded: requiresOrgAdmin)
  });

  it("grants a non-admin who HAS the UserAppAccess row for the app", async () => {
    db.app.findUnique.mockResolvedValue(APPS.quiktrack);
    seed({
      orgEnabled: [{ appId: APPS.quikscale.id }, { appId: APPS.quiktrack.id }],
      userApps: [APPS.quiktrack.id],
    });

    const res = await getAppAccess({ ...BASE, appSlug: "quiktrack" });
    expect(res.hasAccess).toBe(true);
  });

  it("grants an org admin on org-level access alone (no UserAppAccess row)", async () => {
    db.app.findUnique.mockResolvedValue(APPS.quikscale);
    seed({ orgEnabled: [{ appId: APPS.quikscale.id }], userApps: [] });

    const res = await getAppAccess({ ...BASE, appSlug: "quikscale", memberRole: "org_admin" });
    expect(res.hasAccess).toBe(true);
  });

  it("denies when the org has no OrgAppAccess row for the app", async () => {
    db.app.findUnique.mockResolvedValue(APPS.quikscale);
    seed({ orgEnabled: [{ appId: APPS.quiktrack.id }], userApps: [APPS.quiktrack.id] });

    const res = await getAppAccess({ ...BASE, appSlug: "quikscale" });
    expect(res.hasAccess).toBe(false);
  });

  it("denies access when the app's per-app trial has expired", async () => {
    db.app.findUnique.mockResolvedValue(APPS.quiktrack);
    seed({
      orgEnabled: [{ appId: APPS.quiktrack.id, trialEndsAt: new Date(0) }], // long expired
      userApps: [APPS.quiktrack.id],
    });

    const res = await getAppAccess({ ...BASE, appSlug: "quiktrack" });
    expect(res.hasAccess).toBe(false);
  });
});
