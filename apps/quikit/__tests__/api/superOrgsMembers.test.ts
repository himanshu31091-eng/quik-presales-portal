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

// SSO domain classification — controlled per-test so we never hit DNS.
vi.mock("@quikit/shared/sso-domain-server", () => ({
  classifySsoProviderAsync: vi.fn(),
}));

// bcrypt is slow; stub its hash to keep tests fast and deterministic.
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue("hashed-password"),
  compare: vi.fn().mockResolvedValue(true),
}));

import { GET, POST, PATCH } from "@/app/api/super/orgs/[id]/members/route";
import { logAudit } from "@/lib/auditLog";
import { sendMemberAddedEmail } from "@/lib/email";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "t-1" } };

function postReq(body: unknown) {
  return makeRequest("http://localhost:3006/api/super/orgs/t-1/members", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getReq(query = "") {
  return makeRequest(`http://localhost:3006/api/super/orgs/t-1/members${query}`);
}

function patchReq(body: unknown) {
  return makeRequest("http://localhost:3006/api/super/orgs/t-1/members", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const NATIVE_BODY = {
  email: "new@acme.com",
  role: "member",
  inviteMethod: "native",
};

describe("POST /api/super/orgs/[id]/members", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
    vi.mocked(sendMemberAddedEmail).mockClear();
    vi.mocked(classifySsoProviderAsync).mockReset();
    // syncMemberRole iterates provisioned apps — default to none.
    mockDb.orgAppAccess.findMany.mockResolvedValue([] as never);
    mockDb.orgMember.update.mockResolvedValue({} as never);
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(postReq(NATIVE_BODY), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(postReq(NATIVE_BODY), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 400 when role is not Org Admin or Member", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(postReq({ ...NATIVE_BODY, role: "viewer" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("returns 404 when org not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue(null as never);

    const res = await POST(postReq(NATIVE_BODY), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("Organisation not found");
  });

  it("returns 422 for an SSO invite with a non-SSO email", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    vi.mocked(classifySsoProviderAsync).mockResolvedValue(null);

    const res = await POST(
      postReq({ email: "user@custom.io", role: "member", inviteMethod: "sso" }),
      PARAMS,
    );
    expect(res.status).toBe(422);
    const body = await bodyOf(res);
    expect(body.error).toContain("Google or Microsoft");
  });

  it("returns 409 when user is already an active member", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    mockDb.user.findUnique.mockResolvedValue({ id: "u-1", email: "new@acme.com" } as never);
    mockDb.orgMember.findUnique.mockResolvedValue({ id: "m-1", status: "active" } as never);

    const res = await POST(postReq(NATIVE_BODY), PARAMS);
    expect(res.status).toBe(409);
  });

  it("creates a native member with a temp password, returns 201", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    mockDb.user.findUnique.mockResolvedValue(null as never);
    mockDb.user.create.mockResolvedValue({
      id: "u-new",
      email: "new@acme.com",
      firstName: "",
      lastName: "",
    } as never);
    mockDb.orgMember.findUnique.mockResolvedValue(null as never);
    mockDb.orgMember.upsert.mockResolvedValue({
      id: "m-new",
      orgId: "t-1",
      userId: "u-new",
      role: "member",
      status: "active",
      user: { id: "u-new", firstName: "", lastName: "", email: "new@acme.com" },
    } as never);

    const res = await POST(postReq(NATIVE_BODY), PARAMS);
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("m-new");
    // New native user → temp password surfaced once.
    expect(typeof body.data.tempPassword).toBe("string");

    expect(mockDb.user.create).toHaveBeenCalledTimes(1);
    expect(mockDb.orgMember.upsert).toHaveBeenCalledTimes(1);
    // syncMemberRole ran (org-level role write).
    expect(mockDb.orgMember.update).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "add_member_direct", entityType: "membership", orgId: "t-1" }),
    );
    expect(sendMemberAddedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "new@acme.com", orgName: "Acme", inviteMethod: "native" }),
    );
  });

  it("creates a passwordless SSO Org Admin, returns 201 with no temp password", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    vi.mocked(classifySsoProviderAsync).mockResolvedValue("google");
    mockDb.user.findUnique.mockResolvedValue(null as never);
    mockDb.user.create.mockResolvedValue({
      id: "u-sso",
      email: "boss@gmail.com",
      firstName: "",
      lastName: "",
    } as never);
    mockDb.orgMember.findUnique.mockResolvedValue(null as never);
    mockDb.orgMember.upsert.mockResolvedValue({
      id: "m-sso",
      orgId: "t-1",
      userId: "u-sso",
      role: "org_admin",
      status: "active",
      user: { id: "u-sso", firstName: "", lastName: "", email: "boss@gmail.com" },
    } as never);

    const res = await POST(
      postReq({ email: "boss@gmail.com", role: "org_admin", inviteMethod: "sso" }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.data.tempPassword).toBeUndefined();

    // SSO user is created passwordless and not forced through Set-Password.
    expect(mockDb.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password: null, mustChangePassword: false }),
      }),
    );
    expect(sendMemberAddedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ inviteMethod: "sso", ssoProvider: "google" }),
    );
  });
});

describe("GET /api/super/orgs/[id]/members", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns a paginated members page", async () => {
    setSession(SUPER_ADMIN);
    mockDb.orgMember.findMany.mockResolvedValue([
      { id: "m-1", role: "member", user: { id: "u-1", firstName: "A", lastName: "B", email: "a@b.com" } },
    ] as never);
    mockDb.orgMember.count.mockResolvedValue(25 as never);

    const res = await GET(getReq("?page=2&limit=10"), PARAMS);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({ page: 2, limit: 10, total: 25, totalPages: 3 });
    // Offset honoured: page 2 @ limit 10 → skip 10.
    expect(mockDb.orgMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "t-1" }, skip: 10, take: 10 }),
    );
  });

  it("applies a search filter across name, email and role", async () => {
    setSession(SUPER_ADMIN);
    mockDb.orgMember.findMany.mockResolvedValue([] as never);
    mockDb.orgMember.count.mockResolvedValue(0 as never);

    const res = await GET(getReq("?search=org%20admin"), PARAMS);
    expect(res.status).toBe(200);

    const where = vi.mocked(mockDb.orgMember.findMany).mock.calls[0][0]?.where as {
      orgId: string;
      OR: Array<Record<string, unknown>>;
    };
    expect(where.orgId).toBe("t-1");
    // role term has spaces normalised to underscores ("org admin" → org_admin)
    expect(where.OR).toEqual(
      expect.arrayContaining([{ role: { contains: "org_admin", mode: "insensitive" } }]),
    );
    // each whitespace token is matched against first and last name
    expect(where.OR).toEqual(
      expect.arrayContaining([{ user: { firstName: { contains: "org", mode: "insensitive" } } }]),
    );
    expect(where.OR).toEqual(
      expect.arrayContaining([{ user: { lastName: { contains: "admin", mode: "insensitive" } } }]),
    );
  });
});

describe("PATCH /api/super/orgs/[id]/members", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
    mockDb.orgAppAccess.findMany.mockResolvedValue([] as never);
    mockDb.orgMember.update.mockResolvedValue({} as never);
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await PATCH(patchReq({ userId: "u-1", role: "org_admin" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await PATCH(patchReq({ userId: "u-1", role: "org_admin" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body", async () => {
    setSession(SUPER_ADMIN);
    const res = await PATCH(patchReq({ userId: "u-1" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the member is not in the org", async () => {
    setSession(SUPER_ADMIN);
    mockDb.orgMember.findUnique.mockResolvedValue(null as never);
    const res = await PATCH(patchReq({ userId: "u-1", role: "org_admin" }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("refuses to change a super admin's role", async () => {
    setSession(SUPER_ADMIN);
    mockDb.orgMember.findUnique.mockResolvedValue({
      id: "m-1",
      role: "super_admin",
      user: { email: "x@y.com" },
    } as never);
    const res = await PATCH(patchReq({ userId: "u-1", role: "member" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("no-ops (200) when the role is unchanged and does not write", async () => {
    setSession(SUPER_ADMIN);
    mockDb.orgMember.findUnique.mockResolvedValue({
      id: "m-1",
      role: "member",
      user: { email: "x@y.com" },
    } as never);
    const res = await PATCH(patchReq({ userId: "u-1", role: "member" }), PARAMS);
    expect(res.status).toBe(200);
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });

  it("blocks demoting the last Org Admin (409)", async () => {
    setSession(SUPER_ADMIN);
    mockDb.orgMember.findUnique.mockResolvedValue({
      id: "m-1",
      role: "org_admin",
      user: { email: "x@y.com" },
    } as never);
    mockDb.orgMember.count.mockResolvedValue(1 as never);
    const res = await PATCH(patchReq({ userId: "u-1", role: "member" }), PARAMS);
    expect(res.status).toBe(409);
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });

  it("promotes a member to Org Admin and audits the change", async () => {
    setSession(SUPER_ADMIN);
    mockDb.orgMember.findUnique.mockResolvedValue({
      id: "m-1",
      role: "member",
      user: { email: "x@y.com" },
    } as never);
    const res = await PATCH(patchReq({ userId: "u-1", role: "org_admin" }), PARAMS);
    expect(res.status).toBe(200);
    expect(mockDb.orgMember.update).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update_member_role", orgId: "t-1" }),
    );
  });

  it("demotes an Org Admin to Member when others remain", async () => {
    setSession(SUPER_ADMIN);
    mockDb.orgMember.findUnique.mockResolvedValue({
      id: "m-1",
      role: "org_admin",
      user: { email: "x@y.com" },
    } as never);
    mockDb.orgMember.count.mockResolvedValue(2 as never);
    const res = await PATCH(patchReq({ userId: "u-1", role: "member" }), PARAMS);
    expect(res.status).toBe(200);
    expect(mockDb.orgMember.update).toHaveBeenCalledTimes(1);
  });
});
