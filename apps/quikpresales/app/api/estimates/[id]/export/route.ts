import { NextResponse } from "next/server";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { notFound, fail } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { paiseToMajorNumber } from "@/lib/estimates/money";

const withEstimateAuth = withOrgAuthForModule("estimates");

function safeFilename(title: string): string {
  const base = title.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-").slice(0, 80) || "estimate";
  return `${base}.xlsx`;
}

/**
 * POST /api/estimates/[id]/export — stream an .xlsx.
 *
 * Amount cells carry a real SUM formula rather than a baked-in number, so the
 * recipient can adjust a quantity in Excel and see the total move. The stored
 * total is still authoritative on our side — this is a working copy.
 *
 * `exceljs` is imported dynamically; it's large and only needed here.
 */
export const POST = withEstimateAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "estimates", "view");
    if (denied) return denied;

    const estimate = await db.psCostEstimate.findFirst({
      where: { id: params.id, orgId },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        engagement: { select: { title: true } },
      },
    });
    if (!estimate) return notFound("Estimate");
    if (estimate.lines.length === 0) return fail(400, "Estimate has no lines to export");

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "QuikPreSales";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Estimate");

    sheet.mergeCells("A1:F1");
    sheet.getCell("A1").value = estimate.title;
    sheet.getCell("A1").font = { size: 15, bold: true };

    sheet.mergeCells("A2:F2");
    sheet.getCell("A2").value = estimate.engagement.title;
    sheet.getCell("A2").font = { size: 10, italic: true, color: { argb: "FF6B7280" } };

    const headerRow = 4;
    sheet.getRow(headerRow).values = [
      "#",
      "Description",
      "Role",
      "Quantity",
      "Unit",
      `Rate (${estimate.currency})`,
      `Amount (${estimate.currency})`,
    ];
    sheet.getRow(headerRow).font = { bold: true };
    sheet.getRow(headerRow).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" },
    };

    estimate.lines.forEach((line, i) => {
      const r = headerRow + 1 + i;
      sheet.getRow(r).values = [
        i + 1,
        line.description,
        line.role ?? "",
        line.quantity,
        line.unit ?? "",
        paiseToMajorNumber(line.rate),
        // Live formula so the sheet recalculates if the recipient edits it.
        { formula: `D${r}*F${r}`, result: paiseToMajorNumber(line.amount) },
      ];
    });

    const firstDataRow = headerRow + 1;
    const lastDataRow = headerRow + estimate.lines.length;
    const totalRow = lastDataRow + 1;

    sheet.getCell(`F${totalRow}`).value = "Total";
    sheet.getCell(`F${totalRow}`).font = { bold: true };
    sheet.getCell(`G${totalRow}`).value = {
      formula: `SUM(G${firstDataRow}:G${lastDataRow})`,
      result: paiseToMajorNumber(estimate.totalAmount),
    };
    sheet.getCell(`G${totalRow}`).font = { bold: true };

    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 52;
    sheet.getColumn(3).width = 20;
    sheet.getColumn(4).width = 11;
    sheet.getColumn(5).width = 11;
    sheet.getColumn(6).width = 16;
    sheet.getColumn(7).width = 18;
    sheet.getColumn(6).numFmt = "#,##0.00";
    sheet.getColumn(7).numFmt = "#,##0.00";

    if (estimate.assumptions) {
      const notes = workbook.addWorksheet("Assumptions");
      notes.getColumn(1).width = 110;
      estimate.assumptions.split("\n").forEach((line, i) => {
        notes.getCell(i + 1, 1).value = line;
        notes.getCell(i + 1, 1).alignment = { wrapText: true, vertical: "top" };
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const body = Buffer.from(arrayBuffer);

    await writeAudit(db, {
      orgId,
      userId,
      action: "estimate.export",
      resource: estimate.id,
      metadata: { format: "xlsx", lineCount: estimate.lines.length },
    });

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFilename(estimate.title)}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  },
);
