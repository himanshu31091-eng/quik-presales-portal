/**
 * Tests — GET /api/oauth/authorize (app-access gate)
 *
 * Regression coverage for the "user signs in directly to an app they aren't
 * granted" flow. Previously the authorize endpoint completed the handshake
 * with `?error=access_denied` back to the callback (which dead-ended on the
 * app's /login → signIn loop). It now redirects the user to the app's own
 * public landing page with `?reason=no_app_access`, where the shared
 * <AppAccessDeniedPopup /> surfaces an app-specific message.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

// The route reads the raw JWT for the shared session id after the session
// check; stub it so the access branch is reached.
vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(async () => ({ sessionId: "sess-1" })),
}));

// Auth-code generation is irrelevant to the access-denied branch, but the
// module is imported at the top of the route.
vi.mock("@/lib/oauth", () => ({
  generateAuthCode: vi.fn(() => "test-code"),
}));

import { GET } from "@/app/api/oauth/authorize/route";

const CLIENT_ID = "quikscale";
const REDIRECT_URI = "http://localhost:3003/api/auth/callback/quikit";
const APP_BASE_URL = "http://localhost:3003";

function authorizeReq(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/oauth/authorize");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const BASE_PARAMS = {
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: "openid profile email tenant",
  state: "xyz",
};

describe("GET /api/oauth/authorize — app access gate", () => {
  beforeEach(() => {
    resetMockDb();
    // Registered client with the matching redirect URI.
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile", "email", "tenant"],
    } as never);
    // The App backing this client, with a slug + landing baseUrl.
    mockDb.app.findFirst.mockResolvedValue({
      id: "app-quikscale",
      slug: "quikscale",
      baseUrl: APP_BASE_URL,
    } as never);
  });

  it("redirects a denied user to the landing page with reason + authoritative other-apps count + launcher home", async () => {
    setSession({ id: "user-1", email: "u@test.com", orgId: "org-1" });
    mockDb.userAppAccess.findFirst.mockResolvedValue(null); // not granted THIS app
    // countOtherAccessibleApps(): the user has access to one OTHER app (quikhrms).
    mockDb.app.findMany.mockResolvedValue([
      { id: "app-quikscale", requiresOrgAdmin: false },
      { id: "app-quikhrms", requiresOrgAdmin: false },
    ] as never);
    mockDb.orgAppAccess.findMany.mockResolvedValue([{ appId: "app-quikhrms" }] as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ appId: "app-quikhrms" }] as never);

    const res = await GET(authorizeReq(BASE_PARAMS));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe(APP_BASE_URL);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("reason")).toBe("no_app_access");
    // Authoritative signals for the popup — one other app, launcher origin.
    expect(location.searchParams.get("others")).toBe("1");
    expect(location.searchParams.get("home")).toBe("http://localhost:3000");
    // Must NOT leak an OAuth error back to the callback anymore.
    expect(location.searchParams.get("error")).toBeNull();
    // No auth code is issued for a denied user.
    expect(mockDb.oAuthCode.create).not.toHaveBeenCalled();
  });

  it("reports others=0 when the denied user has no other accessible apps", async () => {
    setSession({ id: "user-1", email: "u@test.com", orgId: "org-1" });
    mockDb.userAppAccess.findFirst.mockResolvedValue(null);
    mockDb.app.findMany.mockResolvedValue([
      { id: "app-quikscale", requiresOrgAdmin: false },
    ] as never);
    mockDb.orgAppAccess.findMany.mockResolvedValue([] as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([] as never);

    const res = await GET(authorizeReq(BASE_PARAMS));

    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("reason")).toBe("no_app_access");
    expect(location.searchParams.get("others")).toBe("0");
  });

  it("issues an auth code and redirects to redirect_uri when the user HAS access", async () => {
    setSession({ id: "user-1", email: "u@test.com", orgId: "org-1" });
    mockDb.userAppAccess.findFirst.mockResolvedValue({ id: "access-1" } as never);
    mockDb.oAuthCode.create.mockResolvedValue({} as never);

    const res = await GET(authorizeReq(BASE_PARAMS));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe(APP_BASE_URL);
    expect(location.pathname).toBe("/api/auth/callback/quikit");
    expect(location.searchParams.get("code")).toBe("test-code");
    expect(location.searchParams.get("state")).toBe("xyz");
    expect(mockDb.oAuthCode.create).toHaveBeenCalledOnce();
  });
});
