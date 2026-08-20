import React from "react";
import type { ReportsData, MoneyBucket } from "@/lib/reports";
import { fromMinorUnits } from "@/lib/currency/currencies";

/**
 * Reports module PDF — an executive summary packet, tables only.
 *
 * `@react-pdf/renderer` is dynamically imported, same as the proposal PDF
 * exporter, since it is heavy and only needed on this export path. No charts
 * are rendered here (react-pdf has no chart primitive); the on-screen module
 * has the visuals, this is the printable/attachable summary.
 */

function moneyText(money: MoneyBucket[]): string {
  if (money.length === 0) return "—";
  return money.map((m) => `${m.currency} ${fromMinorUnits(m.minorUnits, m.currency).toLocaleString()}`).join(" · ");
}

export async function buildReportsPdf(data: ReportsData): Promise<Buffer> {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } = await import("@react-pdf/renderer");

  const s = StyleSheet.create({
    page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 9.5, lineHeight: 1.4, color: "#1f2937" },
    title: { fontSize: 20, fontWeight: 700, marginBottom: 4, color: "#111827" },
    subtitle: { fontSize: 10, color: "#6b7280", marginBottom: 22 },
    sectionTitle: { fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, color: "#111827" },
    row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 4 },
    headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111827", paddingBottom: 4, marginBottom: 2 },
    headCell: { fontWeight: 700, fontSize: 8.5, textTransform: "uppercase", color: "#6b7280" },
    cell: { fontSize: 9.5 },
    footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#9ca3af", textAlign: "center" },
    empty: { fontStyle: "italic", color: "#9ca3af", marginBottom: 6 },
  });

  const col = (flex: number) => ({ flex });

  function Table({ headers, widths, rows }: { headers: string[]; widths: number[]; rows: (string | number)[][] }) {
    if (rows.length === 0) return <Text style={s.empty}>No data in this window.</Text>;
    return (
      <View>
        <View style={s.headRow}>
          {headers.map((h, i) => (
            <Text key={h} style={[s.headCell, col(widths[i])]}>
              {h}
            </Text>
          ))}
        </View>
        {rows.map((row, i) => (
          <View key={i} style={s.row}>
            {row.map((cellValue, j) => (
              <Text key={j} style={[s.cell, col(widths[j])]}>
                {String(cellValue)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }

  const doc = (
    <Document title="QuikPreSales Reports">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Reports</Text>
        <Text style={s.subtitle}>
          Generated {new Date(data.generatedAt).toLocaleDateString()} · trailing/forward window: {data.months} months
        </Text>

        <Text style={s.sectionTitle}>Pipeline by stage</Text>
        <Table
          headers={["Stage", "Count", "Value"]}
          widths={[2, 1, 2]}
          rows={data.pipeline.map((p) => [p.label, p.count, moneyText(p.money)])}
        />

        <Text style={s.sectionTitle}>Industry split</Text>
        <Table
          headers={["Industry", "Count", "Value"]}
          widths={[2, 1, 2]}
          rows={data.industrySplit.map((p) => [p.industry, p.count, moneyText(p.money)])}
        />

        <Text style={s.sectionTitle}>Practice split (derived from technology)</Text>
        <Table
          headers={["Practice", "Count", "Value"]}
          widths={[2, 1, 2]}
          rows={data.practiceSplit.rows.map((p) => [p.practice, p.count, moneyText(p.money)])}
        />

        <Text style={s.sectionTitle}>
          Win rate — {data.winRate.overall.won}W / {data.winRate.overall.lost}L
          {data.winRate.overall.winRatePct !== null ? ` (${data.winRate.overall.winRatePct}%)` : ""}
        </Text>
        <Table
          headers={["Month", "Won", "Lost", "Win Rate"]}
          widths={[2, 1, 1, 1]}
          rows={data.winRate.trend.map((t) => [t.label, t.won, t.lost, t.winRatePct !== null ? `${t.winRatePct}%` : "—"])}
        />

        <Text style={s.sectionTitle}>Revenue (realized, won deals)</Text>
        <Table
          headers={["Month", "Value"]}
          widths={[2, 3]}
          rows={data.revenue.trend.map((t) => [t.label, moneyText(t.money)])}
        />

        <Text style={s.sectionTitle}>Forecast (probability-weighted open pipeline)</Text>
        <Table
          headers={["Month", "Value"]}
          widths={[2, 3]}
          rows={data.forecast.trend.map((t) => [t.label, moneyText(t.money)])}
        />

        <Text style={s.sectionTitle}>
          Proposal turnaround — avg {data.proposalTurnaround.overall.avgHours ?? "—"}h,{" "}
          {data.proposalTurnaround.overall.within24hPct ?? "—"}% within 24h
        </Text>
        <Table
          headers={["Month", "Avg Hours", "Within 24h", "Approved"]}
          widths={[2, 1, 1, 1]}
          rows={data.proposalTurnaround.trend.map((t) => [
            t.label,
            t.avgHours ?? "—",
            t.within24hPct !== null ? `${t.within24hPct}%` : "—",
            t.approvedCount,
          ])}
        />

        <Text style={s.sectionTitle}>Demo performance</Text>
        <Table
          headers={["Technology", "Count", "Avg Score"]}
          widths={[2, 1, 1]}
          rows={data.demoPerformance.map((d) => [d.technology, d.count, d.avgScore ?? "—"])}
        />

        <Text style={s.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
