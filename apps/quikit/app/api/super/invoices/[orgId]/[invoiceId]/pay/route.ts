/**
 * SA-B.3 — Dummy payment endpoints.
 *
 * POST /api/super/invoices/:orgId/:invoiceId/pay
 *   Body: { outcome: "paid" | "failed", notes?: string }
 *
 * Simulates the result of a Stripe (or other) payment attempt. For Phase B
 * we just flip the status column and timestamp the decision.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";

export const POST = withSuperAdminAuth<{ orgId: string; invoiceId: string }>(async ({ userId }, req: NextRequest, { params }) => {
  try {
    const invoice = await db.invoice.findFirst({
      where: { id: params.invoiceId, orgId: params.orgId },
    });
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const outcome = body.outcome === "paid" || body.outcome === "failed" ? body.outcome : null;
    if (!outcome) {
      return NextResponse.json({ success: false, error: "outcome must be 'paid' or 'failed'" }, { status: 400 });
    }

    const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : invoice.notes;
    const now = new Date();

    const updated = await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: outcome,
        paidAt: outcome === "paid" ? now : null,
        failedAt: outcome === "failed" ? now : null,
        notes,
      },
    });

    logAudit({
      orgId: params.orgId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Invoice",
      entityId: invoice.id,
      oldValues: JSON.stringify({ status: invoice.status }),
      newValues: JSON.stringify({ status: outcome, at: now.toISOString() }),
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update invoice";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
