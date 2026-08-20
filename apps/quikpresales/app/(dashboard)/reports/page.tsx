"use client";

import { useState } from "react";
import { Select, Button } from "@quikit/ui";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useApiQuery, downloadFile } from "@/lib/api-client";
import { PageHeader, Panel, StatTile, Loading, ErrorNote } from "@/components/ui-kit";
import { useDisplayCurrency } from "@/lib/hooks/useCurrency";

interface MoneyBucket {
  currency: string;
  minorUnits: string;
}

interface ReportsData {
  months: number;
  generatedAt: string;
  pipeline: { stage: string; label: string; count: number; money: MoneyBucket[] }[];
  industrySplit: { industry: string; count: number; money: MoneyBucket[] }[];
  practiceSplit: { derived: true; rows: { practice: string; count: number; money: MoneyBucket[] }[] };
  winRate: {
    overall: { won: number; lost: number; winRatePct: number | null };
    byReason: Record<string, number>;
    trend: { month: string; label: string; won: number; lost: number; winRatePct: number | null }[];
  };
  revenue: { trend: { month: string; label: string; money: MoneyBucket[] }[] };
  forecast: { trend: { month: string; label: string; money: MoneyBucket[] }[] };
  proposalTurnaround: {
    overall: { avgHours: number | null; within24hPct: number | null; approvedCount: number };
    trend: { month: string; label: string; avgHours: number | null; within24hPct: number | null; approvedCount: number }[];
  };
  demoPerformance: { technology: string; count: number; avgScore: number | null }[];
}

/** Fixed data-series palette — chart colours are semantic, not brandable. See root CLAUDE.md. */
const SERIES = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#65a30d"];

export default function ReportsPage() {
  const [months, setMonths] = useState(6);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const { totalMajor, formatTotal, displayCurrency } = useDisplayCurrency();

  const { data, isLoading, error } = useApiQuery<ReportsData>(
    ["reports", months],
    `/api/reports?months=${months}`,
  );

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(format);
    try {
      await downloadFile(format === "xlsx" ? "/api/reports/export" : "/api/reports/export-pdf", { months });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Pipeline, win rate, revenue, forecast, proposal turnaround and demo performance — in one place."
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={String(months)}
              onChange={(e) => setMonths(Number(e.target.value))}
              options={[
                { value: "3", label: "3 months" },
                { value: "6", label: "6 months" },
                { value: "12", label: "12 months" },
                { value: "24", label: "24 months" },
              ]}
              className="max-w-[140px]"
            />
            <Button variant="secondary" onClick={() => handleExport("xlsx")} disabled={exporting !== null}>
              {exporting === "xlsx" ? "Exporting…" : "Export Excel"}
            </Button>
            <Button variant="secondary" onClick={() => handleExport("pdf")} disabled={exporting !== null}>
              {exporting === "pdf" ? "Exporting…" : "Export PDF"}
            </Button>
          </div>
        }
      />

      {error ? <ErrorNote error={error} /> : null}
      {isLoading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile
              label="Open pipeline"
              value={formatTotal(data.pipeline.flatMap((p) => p.money))}
              hint={`${data.pipeline.reduce((s, p) => s + p.count, 0)} open deals`}
            />
            <StatTile
              label="Win rate"
              value={data.winRate.overall.winRatePct !== null ? `${data.winRate.overall.winRatePct}%` : "—"}
              hint={`${data.winRate.overall.won}W / ${data.winRate.overall.lost}L, all time`}
            />
            <StatTile
              label="Proposal turnaround"
              value={
                data.proposalTurnaround.overall.avgHours !== null
                  ? `${data.proposalTurnaround.overall.avgHours}h avg`
                  : "—"
              }
              hint={
                data.proposalTurnaround.overall.within24hPct !== null
                  ? `${data.proposalTurnaround.overall.within24hPct}% within 24h`
                  : "No approvals in window"
              }
            />
            <StatTile
              label="Forecast (next)"
              value={formatTotal(data.forecast.trend[0]?.money ?? [])}
              hint={data.forecast.trend[0]?.label ?? "—"}
            />
          </div>

          <Panel title="Pipeline by stage">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={data.pipeline.map((p) => ({ label: p.label, count: p.count, value: totalMajor(p.money) }))}
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(v) => Math.round(v).toLocaleString()} />
                <Tooltip
                  formatter={(value: number, name) =>
                    name === "Deals" ? [value, name] : [`${displayCurrency} ${Math.round(value).toLocaleString()}`, name]
                  }
                />
                <Legend />
                <Bar yAxisId="left" dataKey="count" name="Deals" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="value" name={`Value (${displayCurrency})`} fill={SERIES[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Industry split">
              <PieByCount rows={data.industrySplit.map((r) => ({ name: r.industry, value: r.count }))} />
            </Panel>
            <Panel title="Practice split (derived from technology)">
              <PieByCount rows={data.practiceSplit.rows.map((r) => ({ name: r.practice, value: r.count }))} />
            </Panel>
          </div>

          <Panel title="Win rate trend">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.winRate.trend} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number | string | Array<number | string>) => (v === null ? "No decisions" : `${v}%`)} />
                <Line type="monotone" dataKey="winRatePct" name="Win rate" stroke={SERIES[0]} strokeWidth={2} dot connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
            {Object.keys(data.winRate.byReason).length > 0 ? (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Loss reasons (all time)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    layout="vertical"
                    data={Object.entries(data.winRate.byReason).map(([reason, count]) => ({ reason, count }))}
                    margin={{ left: 24, right: 16, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="reason" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill={SERIES[3]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </Panel>

          <Panel title="Revenue &amp; forecast">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={[
                  ...data.revenue.trend.map((t) => ({ label: t.label, realized: totalMajor(t.money) })),
                  ...data.forecast.trend
                    .slice(1)
                    .map((t) => ({ label: t.label, forecast: totalMajor(t.money) })),
                ]}
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => Math.round(v).toLocaleString()} />
                <Tooltip formatter={(v: number) => `${displayCurrency} ${Math.round(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="realized" name={`Realized (${displayCurrency})`} fill={SERIES[1]} radius={[4, 4, 0, 0]} />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  name={`Forecast (${displayCurrency})`}
                  stroke={SERIES[2]}
                  fill={SERIES[2]}
                  fillOpacity={0.15}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-gray-400">
              Forecast is probability-weighted (deal value × win probability), bucketed by expected close month — it is a
              read of the pipeline as recorded today, not a statistical projection.
            </p>
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Proposal turnaround">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.proposalTurnaround.trend} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit="h" />
                  <Tooltip formatter={(v: number | string | Array<number | string>) => (v === null ? "No approvals" : `${v}h`)} />
                  <Line type="monotone" dataKey="avgHours" name="Avg hours to approve" stroke={SERIES[4]} strokeWidth={2} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Demo performance by technology">
              {data.demoPerformance.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">No rated demos yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    layout="vertical"
                    data={data.demoPerformance}
                    margin={{ left: 24, right: 16, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="technology" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number, name) => (name === "Avg score" ? `${v} / 5` : v)} />
                    <Bar dataKey="avgScore" name="Avg score" fill={SERIES[5]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function PieByCount({ rows }: { rows: { name: string; value: number }[] }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">No open deals in this dimension yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {rows.map((entry, i) => (
            <Cell key={entry.name} fill={SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
