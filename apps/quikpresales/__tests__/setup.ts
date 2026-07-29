import "@testing-library/jest-dom/vitest";
import { vi, beforeEach } from "vitest";

/**
 * Global test setup.
 *
 * Two control surfaces, both mirroring the quikscale harness:
 *   - `setSession(user)` drives every auth check
 *   - `setPermissionGate(bool)` drives the RBAC guard, so most tests don't
 *     have to seed role tables just to reach the handler body
 */

export type TestUser = {
  id: string;
  orgId: string;
  email?: string;
  membershipRole?: string;
};

const _session: { user: TestUser | null } = { user: null };

// The auth factories import getServerSession from "next-auth"; App Router
// handlers sometimes import from "next-auth/next". Both resolve to the same
// state so tests have one place to set the session.
const mockedGetServerSession = vi.fn(async () =>
  _session.user ? { user: _session.user } : null,
);

vi.mock("next-auth", async () => {
  const actual = await vi.importActual<typeof import("next-auth")>("next-auth");
  return { ...actual, getServerSession: mockedGetServerSession };
});

vi.mock("next-auth/next", () => ({ getServerSession: mockedGetServerSession }));

export function setSession(user: TestUser | null) {
  _session.user = user;
}

/**
 * `getOrgId` comes from the shared factory and re-validates membership against
 * the DB plus a Redis cache. Stubbing it keeps route tests focused on the
 * handler; the 401 path is still exercised because the wrapper checks the
 * session before it ever calls this.
 */
vi.mock("@/lib/api/getOrgId", () => ({
  getOrgId: vi.fn(async () => _session.user?.orgId ?? null),
}));

/** Feature-flag gate open by default, so module gating doesn't 404 every test. */
vi.mock("@quikit/auth/feature-gate", () => ({
  gateModuleApi: vi.fn(async () => null),
  getDisabledModules: vi.fn(async () => new Set<string>()),
}));

/** Fire-and-forget API logging — must never touch the mocked DB. */
vi.mock("@quikit/shared/apiLogging", () => ({
  logApiCall: vi.fn(async () => undefined),
}));

const _perm: { allow: boolean } = { allow: true };

vi.mock("@/lib/api/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/rbac")>("@/lib/api/rbac");
  const { NextResponse } = await import("next/server");
  return {
    ...actual,
    userCan: vi.fn(async () => _perm.allow),
    hasAdminAccess: vi.fn(async () => _perm.allow),
    seedAllDefaultRoles: vi.fn(async () => undefined),
    getQuikPreSalesAppId: vi.fn(async () => "app_quikpresales_test"),
    requirePermission: vi.fn(async () =>
      _perm.allow
        ? null
        : NextResponse.json(
            { success: false, error: "You do not have permission to perform this action" },
            { status: 403 },
          ),
    ),
  };
});

/** Flip to false in a test that asserts the 403 path. */
export function setPermissionGate(allow: boolean) {
  _perm.allow = allow;
}

beforeEach(() => {
  setSession(null);
  setPermissionGate(true);
  vi.clearAllMocks();
});
