import { z } from "zod";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { isStage, STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { fromMinorUnits } from "@/lib/currency/currencies";

const withEngagementAuth = withOrgAuthForModule("engagements");

const exportSchema = z.object({
  stage: z.string().refine((v) => isStage(v), "Unknown stage").optional(),
  closedStatus: z.enum(["open", "won", "lost"]).optional(),
  search: z.string().max(120).optional(),
  industry: z.string().max(80).optional(),
  closeFrom: z.string().datetime().optional(),
  closeTo: z.string().datetime().optional(),
  mine: z.boolean().optional(),
});

const MAX_ROWS = 5000;

/**
 * POST /api/engagements/export — the current filtered view, as .xlsx.
 *
 * Respects the same filters the list page applies, so "export" means
 * "export what I'm looking at," not a separate unfiltered dump.
 */
export const POST = withEngagementAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "engagements", "view");
  if (denied) return denied;

  const parsed = exportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const { stage, closedStatus, search, industry, closeFrom, closeTo, mine } = parsed.data;

  const where: Prisma.PsEngagementWhereInput = {
    orgId,
    deletedAt: null,
    ...(stage && { stage }),
    ...(closedStatus && { closedStatus }),
    ...(search && { title: { contains: search, mode: "insensitive" as const } }),
    ...(industry && { industry }),
    ...((closeFrom || closeTo) && {
      expectedClose: {
        ...(closeFrom && { gte: new Date(closeFrom) }),
        ...(closeTo && { lte: new Date(closeTo) }),
      },
    }),
    ...(mine && { OR: [{ salesOwnerId: userId }, { presalesOwnerId: userId }] }),
  };

  const items = await db.psEngagement.findMany({
    where,
    select: {
      title: true,
      industry: true,
      territory: true,
      stage: true,
      closedStatus: true,
      estRevenue: true,
      currency: true,
      probability: true,
      expectedClose: true,
      aiDealHealth: true,
      salesOwnerId: true,
      presalesOwnerId: true,
      crmOpportunityId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS,
  });

  const ownerIds = [
    ...new Set(items.flatMap((e) => [e.salesOwnerId, e.presalesOwnerId]).filter((v): v is string => !!v)),
  ];
  const owners = ownerIds.length
    ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, `${o.firstName} ${o.lastName}`.trim()]));

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QuikPreSales";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Engagements");
  const headers = [
    "Title",
    "Sales Owner",
    "Presales Owner",
    "Industry",
    "Territory",
    "Stage",
    "Value",
    "Currency",
    "Probability %",
    "Expected Close",
    "Deal Health",
    "CRM Opportunity",
    "Created",
    "Updated",
  ];
  sheet.getRow(1).values = headers;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };

  items.forEach((e, i) => {
    sheet.getRow(i + 2).values = [
      e.title,
      e.salesOwnerId ? (ownerName.get(e.salesOwnerId) ?? "") : "",
      e.presalesOwnerId ? (ownerName.get(e.presalesOwnerId) ?? "") : "",
      e.industry ?? "",
      e.territory ?? "",
      STAGE_LABEL[e.stage as Stage] ?? e.stage,
      e.estRevenue ? fromMinorUnits(e.estRevenue, e.currency ?? "INR") : "",
      e.currency ?? "",
      e.probability,
      e.expectedClose ? e.expectedClose.toISOString().slice(0, 10) : "",
      e.aiDealHealth ?? "",
      e.crmOpportunityId ?? "",
      e.createdAt.toISOString().slice(0, 10),
      e.updatedAt.toISOString().slice(0, 10),
    ];
  });

  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = 18;
  });
  sheet.getColumn(1).width = 36;
  sheet.getColumn(7).numFmt = "#,##0.00";

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const body = Buffer.from(arrayBuffer);

  await writeAudit(db, {
    orgId,
    userId,
    action: "engagements.export",
    metadata: { rowCount: items.length },
  });

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="engagements-export.xlsx"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
});
