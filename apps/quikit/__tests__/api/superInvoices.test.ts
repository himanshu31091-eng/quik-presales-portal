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

import {
  GET as LIST_INVOICES,
  POST as CREATE_INVOICE,
} from "@/app/api/super/invoices/[orgId]/route";
import { POST as PAY_INVOICE } from "@/app/api/super/invoices/[orgId]/[invoiceId]/pay/route";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const LIST_PARAMS = { params: { orgId: "tenant-1" } };
const PAY_PARAMS = { params: { orgId: "tenant-1", invoiceId: "inv-1" } };

// ─── GET /api/super/invoices/[orgId] ──────────────────────────────────────

describe("GET /api/super/invoices/[orgId]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await LIST_INVOICES(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1"),
      LIST_PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await LIST_INVOICES(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1"),
      LIST_PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when tenant not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue(null as never);

    const res = await LIST_INVOICES(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1"),
      LIST_PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("returns tenant invoices on success", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({
      id: "tenant-1",
      name: "Acme",
      plan: "startup",
    } as never);
    const now = new Date();
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv-1",
        orgId: "tenant-1",
        planSlug: "startup",
        amountCents: 4900,
        currency: "USD",
        status: "paid",
        periodStart: now,
        periodEnd: now,
        paidAt: now,
        failedAt: null,
        createdAt: now,
        updatedAt: now,
        notes: null,
      },
    ] as never);

    const res = await LIST_INVOICES(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1"),
      LIST_PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.invoices).toHaveLength(1);
    expect(body.data.totals.paid).toBe(4900);
  });
});

// ─── POST /api/super/invoices/[orgId] ─────────────────────────────────────

describe("POST /api/super/invoices/[orgId]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await CREATE_INVOICE(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      LIST_PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await CREATE_INVOICE(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      LIST_PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("creates an invoice and returns 201", async () => {
    setSession(SUPER_ADMIN);
    mockDb.org.findUnique.mockResolvedValue({
      id: "tenant-1",
      plan: "startup",
      name: "Acme",
    } as never);
    mockDb.plan.findUnique.mockResolvedValue({
      slug: "startup",
      priceMonthly: 4900,
      currency: "USD",
    } as never);
    mockDb.invoice.create.mockResolvedValue({
      id: "inv-new",
      orgId: "tenant-1",
      planSlug: "startup",
      amountCents: 4900,
      status: "pending",
    } as never);

    const res = await CREATE_INVOICE(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      LIST_PARAMS,
    );
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("inv-new");
  });
});

// ─── POST /api/super/invoices/[orgId]/[invoiceId]/pay ─────────────────────

describe("POST /api/super/invoices/[orgId]/[invoiceId]/pay", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 404 when invoice not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.invoice.findFirst.mockResolvedValue(null as never);

    const res = await PAY_INVOICE(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1/inv-1/pay", {
        method: "POST",
        body: JSON.stringify({ outcome: "paid" }),
      }),
      PAY_PARAMS,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when outcome is missing/invalid", async () => {
    setSession(SUPER_ADMIN);
    mockDb.invoice.findFirst.mockResolvedValue({
      id: "inv-1",
      orgId: "tenant-1",
      status: "pending",
      notes: null,
    } as never);

    const res = await PAY_INVOICE(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1/inv-1/pay", {
        method: "POST",
        body: JSON.stringify({ outcome: "nope" }),
      }),
      PAY_PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it("marks invoice as paid and returns 200", async () => {
    setSession(SUPER_ADMIN);
    mockDb.invoice.findFirst.mockResolvedValue({
      id: "inv-1",
      orgId: "tenant-1",
      status: "pending",
      notes: null,
    } as never);
    mockDb.invoice.update.mockResolvedValue({
      id: "inv-1",
      orgId: "tenant-1",
      status: "paid",
    } as never);

    const res = await PAY_INVOICE(
      makeRequest("http://localhost:3006/api/super/invoices/tenant-1/inv-1/pay", {
        method: "POST",
        body: JSON.stringify({ outcome: "paid" }),
      }),
      PAY_PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(mockDb.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({ status: "paid" }),
      }),
    );
  });
});
