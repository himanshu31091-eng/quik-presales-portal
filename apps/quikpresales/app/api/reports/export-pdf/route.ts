import { z } from "zod";
import { NextResponse } from "next/server";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { computeReportsData } from "@/lib/reports";

const withReportsAuth = withOrgAuthForModule("dashboard");

const exportSchema = z.object({
  months: z.number().int().min(3).max(24).default(6),
});

/** POST /api/reports/export-pdf — the Reports module, as a printable .pdf. */
export const POST = withReportsAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "dashboard", "view");
  if (denied) return denied;

  const parsed = exportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);

  const data = await computeReportsData(orgId, parsed.data.months);

  const { buildReportsPdf } = await import("@/lib/export/reports-pdf");
  const body = await buildReportsPdf(data);

  await writeAudit(db, { orgId, userId, action: "reports.export", metadata: { format: "pdf", months: parsed.data.months } });

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="quikpresales-reports.pdf"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
});
