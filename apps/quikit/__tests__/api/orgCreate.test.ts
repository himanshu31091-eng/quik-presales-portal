import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

import { POST } from "@/app/api/org/create/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const USER = { id: "user-1", email: "pravin@quikit.ai", isSuperAdmin: false };

function runTransactionInline() {
  // The route wraps its writes in db.$transaction(cb); run the callback against
  // the mock so tx.org.create / tx.orgMember.create / tx.subscription.create run.
  mockDb.$transaction.mockImplementation(
    (async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb)) as never,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/org/create", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 when there is no session", async () => {
    setSession(null);
    const res = await POST(
      makeRequest("http://localhost:3000/api/org/create", {
        method: "POST",
        body: JSON.stringify({ organizationName: "Acme Inc." }),
      }),
    );
    expect(res.status).toBe(401);
    const body = await bodyOf(res);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 400 for invalid input (name too short)", async () => {
    setSession(USER);
    const res = await POST(
      makeRequest("http://localhost:3000/api/org/create", {
        method: "POST",
        body: JSON.stringify({ organizationName: "A" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
    // No writes attempted on invalid input.
    expect(mockDb.org.create).not.toHaveBeenCalled();
  });

  it("creates Org + org_admin OrgMember + active Subscription and returns 201", async () => {
    setSession(USER);
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1", email: "pravin@quikit.ai" } as never);
    mockDb.org.findUnique.mockResolvedValue(null as never); // slug free
    runTransactionInline();
    mockDb.org.create.mockResolvedValue({ id: "org-new", slug: "acme-inc" } as never);
    mockDb.orgMember.create.mockResolvedValue({ id: "m-1" } as never);
    mockDb.subscription.create.mockResolvedValue({ id: "s-1" } as never);

    const res = await POST(
      makeRequest("http://localhost:3000/api/org/create", {
        method: "POST",
        body: JSON.stringify({ organizationName: "Acme Inc." }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ orgId: "org-new", role: "org_admin" });

    // Org created with derived slug + billingEmail sourced from the DB user.
    expect(mockDb.org.create).toHaveBeenCalledTimes(1);
    const orgArg = mockDb.org.create.mock.calls[0][0] as {
      data: { slug: string; billingEmail: string; createdBy: string; plan: string };
    };
    expect(orgArg.data.slug).toBe("acme-inc");
    expect(orgArg.data.billingEmail).toBe("pravin@quikit.ai");
    expect(orgArg.data.createdBy).toBe("user-1");
    expect(orgArg.data.plan).toBe("startup");

    // Caller becomes org_admin with an active, accepted membership.
    const memberArg = mockDb.orgMember.create.mock.calls[0][0] as {
      data: { orgId: string; userId: string; role: string; status: string; acceptedAt: Date };
    };
    expect(memberArg.data).toMatchObject({
      orgId: "org-new",
      userId: "user-1",
      role: "org_admin",
      status: "active",
    });
    expect(memberArg.data.acceptedAt).toBeInstanceOf(Date);

    // Active subscription tagged with the in-app source.
    const subArg = mockDb.subscription.create.mock.calls[0][0] as {
      data: { orgId: string; status: string; planSlug: string; source: string };
    };
    expect(subArg.data).toMatchObject({
      orgId: "org-new",
      status: "active",
      planSlug: "startup",
      source: "self_serve_authenticated",
    });

    // No app access provisioned — fresh workspace starts empty (trials later).
    expect(mockDb.orgAppAccess.create).not.toHaveBeenCalled();
    expect(mockDb.userAppAccess.create).not.toHaveBeenCalled();
    expect(mockDb.userAppAccess.createMany).not.toHaveBeenCalled();
  });

  it("appends a numeric suffix when the derived slug is taken", async () => {
    setSession(USER);
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1", email: "pravin@quikit.ai" } as never);
    // First slug candidate taken, second free.
    mockDb.org.findUnique
      .mockResolvedValueOnce({ id: "existing" } as never)
      .mockResolvedValueOnce(null as never);
    runTransactionInline();
    mockDb.org.create.mockResolvedValue({ id: "org-new", slug: "acme-2" } as never);
    mockDb.orgMember.create.mockResolvedValue({ id: "m-1" } as never);
    mockDb.subscription.create.mockResolvedValue({ id: "s-1" } as never);

    const res = await POST(
      makeRequest("http://localhost:3000/api/org/create", {
        method: "POST",
        body: JSON.stringify({ organizationName: "Acme" }),
      }),
    );

    expect(res.status).toBe(201);
    const orgArg = mockDb.org.create.mock.calls[0][0] as { data: { slug: string } };
    expect(orgArg.data.slug).toBe("acme-2");
  });
});
