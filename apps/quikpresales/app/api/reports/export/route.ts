import { z } from "zod";
import { NextResponse } from "next/server";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { computeReportsData, type MoneyBucket } from "@/lib/reports";
import { fromMinorUnits } from "@/lib/currency/currencies";

const withReportsAuth = withOrgAuthForModule("dashboard");

const exportSchema = z.object({
  months: z.number().int().min(3).max(24).default(6),
});

const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF3F4F6" } };

/**
 * One row per (segment, currency) rather than one column per currency: the
 * set of currencies in play differs by org and by section, and unpivoting
 * avoids inventing an FX-converted total inside a static export.
 */
function moneyRows(money: MoneyBucket[]): { currency: string; amount: number }[] {
  return money.map((m) => ({ currency: m.currency, amount: fromMinorUnits(m.minorUnits, m.currency) }));
}

/** POST /api/reports/export — the Reports module, as a multi-sheet .xlsx. */
export const POST = withReportsAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "dashboard", "view");
  if (denied) return denied;

  const parsed = exportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);

  const data = await computeReportsData(orgId, parsed.data.months);

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QuikPreSales";
  workbook.created = new Date();

  function sheetWithHeader(name: string, headers: string[]) {
    const sheet = workbook.addWorksheet(name);
    sheet.getRow(1).values = headers;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = HEADER_FILL;
    headers.forEach((_, i) => {
      sheet.getColumn(i + 1).width = 20;
    });
    return sheet;
  }

  // Pipeline
  const pipelineSheet = sheetWithHeader("Pipeline", ["Stage", "Count", "Currency", "Value"]);
  let r = 2;
  for (const stage of data.pipeline) {
    const rows = moneyRows(stage.money);
    if (rows.length === 0) {
      pipelineSheet.getRow(r++).values = [stage.label, stage.count, "", ""];
    } else {
      rows.forEach((row, i) => {
        pipelineSheet.getRow(r++).values = [i === 0 ? stage.label : "", i === 0 ? stage.count : "", row.currency, row.amount];
      });
    }
  }
  pipelineSheet.getColumn(1).width = 22;
  pipelineSheet.getColumn(4).numFmt = "#,##0.00";

  // Industry & practice split
  const splitSheet = sheetWithHeader("Industry & Practice", ["Dimension", "Segment", "Count", "Currency", "Value"]);
  r = 2;
  for (const row of data.industrySplit) {
    const rows = moneyRows(row.money);
    if (rows.length === 0) splitSheet.getRow(r++).values = ["Industry", row.industry, row.count, "", ""];
    else rows.forEach((m, i) => (splitSheet.getRow(r++).values = ["Industry", i === 0 ? row.industry : "", i === 0 ? row.count : "", m.currency, m.amount]));
  }
  for (const row of data.practiceSplit.rows) {
    const rows = moneyRows(row.money);
    if (rows.length === 0) splitSheet.getRow(r++).values = ["Practice (derived)", row.practice, row.count, "", ""];
    else rows.forEach((m, i) => (splitSheet.getRow(r++).values = ["Practice (derived)", i === 0 ? row.practice : "", i === 0 ? row.count : "", m.currency, m.amount]));
  }
  splitSheet.getColumn(2).width = 22;
  splitSheet.getColumn(5).numFmt = "#,##0.00";

  // Win rate
  const winSheet = sheetWithHeader("Win Rate", ["Month", "Won", "Lost", "Win Rate %"]);
  data.winRate.trend.forEach((t, i) => {
    winSheet.getRow(i + 2).values = [t.label, t.won, t.lost, t.winRatePct ?? ""];
  });
  const reasonStart = data.winRate.trend.length + 4;
  winSheet.getCell(`A${reasonStart - 1}`).value = "Loss reasons (all time)";
  winSheet.getCell(`A${reasonStart - 1}`).font = { bold: true };
  winSheet.getRow(reasonStart).values = ["Reason", "Count"];
  winSheet.getRow(reasonStart).font = { bold: true };
  Object.entries(data.winRate.byReason).forEach(([reason, count], i) => {
    winSheet.getRow(reasonStart + 1 + i).values = [reason, count];
  });

  // Revenue & forecast
  const revSheet = sheetWithHeader("Revenue & Forecast", ["Month", "Type", "Currency", "Value"]);
  r = 2;
  for (const t of data.revenue.trend) {
    const rows = moneyRows(t.money);
    if (rows.length === 0) revSheet.getRow(r++).values = [t.label, "Realized (won)", "", ""];
    else rows.forEach((m) => (revSheet.getRow(r++).values = [t.label, "Realized (won)", m.currency, m.amount]));
  }
  for (const t of data.forecast.trend) {
    const rows = moneyRows(t.money);
    if (rows.length === 0) revSheet.getRow(r++).values = [t.label, "Forecast (probability-weighted)", "", ""];
    else rows.forEach((m) => (revSheet.getRow(r++).values = [t.label, "Forecast (probability-weighted)", m.currency, m.amount]));
  }
  revSheet.getColumn(4).numFmt = "#,##0.00";

  // Proposal turnaround
  const tatSheet = sheetWithHeader("Proposal Turnaround", ["Month", "Avg Hours", "Within 24h %", "Approved"]);
  data.proposalTurnaround.trend.forEach((t, i) => {
    tatSheet.getRow(i + 2).values = [t.label, t.avgHours ?? "", t.within24hPct ?? "", t.approvedCount];
  });

  // Demo performance
  const demoSheet = sheetWithHeader("Demo Performance", ["Technology", "Count", "Avg Score (1-5)"]);
  data.demoPerformance.forEach((d, i) => {
    demoSheet.getRow(i + 2).values = [d.technology, d.count, d.avgScore ?? ""];
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const body = Buffer.from(arrayBuffer);

  await writeAudit(db, { orgId, userId, action: "reports.export", metadata: { format: "xlsx", months: parsed.data.months } });

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="quikpresales-reports.xlsx"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
});
