import { z } from "zod";
import { NextResponse } from "next/server";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { fromMinorUnits } from "@/lib/currency/currencies";

const withLeadAuth = withOrgAuthForModule("engagements");

const exportSchema = z.object({
  mine: z.boolean().optional(),
  industry: z.string().max(80).optional(),
});

/** POST /api/leads/export — the current lead queue, as .xlsx. */
export const POST = withLeadAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "engagements", "view");
  if (denied) return denied;

  const parsed = exportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);

  const rows = await db.psEngagement.findMany({
    where: {
      orgId,
      deletedAt: null,
      stage: "lead",
      ...(parsed.data.mine && { salesOwnerId: userId }),
      ...(parsed.data.industry && { industry: parsed.data.industry }),
    },
    select: {
      title: true,
      industry: true,
      territory: true,
      salesOwnerId: true,
      estRevenue: true,
      currency: true,
      createdAt: true,
      rfps: {
        select: { requirements: { select: { complianceStatus: true, responseText: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const ownerIds = [...new Set(rows.map((r) => r.salesOwnerId).filter((v): v is string => !!v))];
  const owners = ownerIds.length
    ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, `${o.firstName} ${o.lastName}`.trim()]));

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QuikPreSales";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Leads");
  const headers = ["Title", "Submitted By", "Industry", "Territory", "Value", "Currency", "Blockers", "Answered", "Ready", "Submitted"];
  sheet.getRow(1).values = headers;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };

  rows.forEach((row, i) => {
    const requirements = row.rfps.flatMap((r) => r.requirements);
    const blockers = requirements.filter((r) => r.complianceStatus === "gap");
    const answered = blockers.filter((r) => (r.responseText ?? "").trim() !== "");

    sheet.getRow(i + 2).values = [
      row.title,
      row.salesOwnerId ? (ownerName.get(row.salesOwnerId) ?? "") : "",
      row.industry ?? "",
      row.territory ?? "",
      row.estRevenue ? fromMinorUnits(row.estRevenue, row.currency ?? "INR") : "",
      row.currency ?? "",
      blockers.length,
      answered.length,
      blockers.length === answered.length ? "Yes" : "No",
      row.createdAt.toISOString().slice(0, 10),
    ];
  });

  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = 16;
  });
  sheet.getColumn(1).width = 36;
  sheet.getColumn(5).numFmt = "#,##0.00";

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const body = Buffer.from(arrayBuffer);

  await writeAudit(db, { orgId, userId, action: "leads.export", metadata: { rowCount: rows.length } });

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leads-export.xlsx"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
});
