"use client";

import { useApiQuery, formatMoney } from "@/lib/api-client";
import {
  PageHeader,
  Panel,
  StatTile,
  StatusPill,
  TableShell,
  EmptyRow,
  Loading,
  ErrorNote,
} from "@/components/ui-kit";

interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  activity: {
    newEngagementsSupported: number;
    discoveryCalls: number;
    demosDelivered: number;
    proposalsCreated: number;
    proposalsApproved: number;
    rfpsExtracted: number;
    rfpsDueThisWeek: number;
  };
  turnaround: {
    avgHours: number | null;
    fastestHours: number | null;
    delayedCount: number;
    within24hPct: number | null;
  };
  aiUsage: { aiGeneratedVersions: number; manualVersions: number; adoptionPct: number | null };
  pipeline: { stage: string; label: string; count: number; value: string }[];
  demoPerformance: { technology: string; count: number; avgScore: number | null }[];
  assetsCreated: { templates: number; demos: number; knowledge: number; total: number };
  winLoss: {
    won: number;
    lost: number;
    winRatePct: number | null;
    records: {
      engagement: string;
      outcome: string;
      competitor: string | null;
      reasonCategory: string | null;
      dealSize: string | null;
    }[];
  };
  ragBoard: Record<string, string>;
}

const RAG_LABELS: Record<string, string> = {
  proposalSpeed: "Proposal speed",
  proposalQuality: "Proposal quality",
  demoQuality: "Demo quality",
  assetGrowth: "Asset growth",
  aiAdoption: "AI adoption",
  winRate: "Win rate",
};

export default function WeeklyPage() {
  const { data, isLoading, error } = useApiQuery<WeeklyReport>(["weekly"], "/api/weekly");

  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const week = `${new Date(data.weekStart).toLocaleDateString()} – ${new Date(
    new Date(data.weekEnd).getTime() - 86_400_000,
  ).toLocaleDateString()}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Weekly Dashboard" subtitle={`Week of ${week}`} />

      <Panel title="RAG Status">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(data.ragBoard).map(([key, value]) => (
            <div key={key} className="rounded border border-gray-100 p-3 text-center">
              <p className="mb-2 text-xs text-gray-500">{RAG_LABELS[key] ?? key}</p>
              <StatusPill status={value} label={value === "na" ? "no data" : value} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="New Engagements" value={data.activity.newEngagementsSupported} />
        <StatTile label="Proposals Created" value={data.activity.proposalsCreated} />
        <StatTile label="Proposals Approved" value={data.activity.proposalsApproved} />
        <StatTile label="RFPs Extracted" value={data.activity.rfpsExtracted} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Proposal Turnaround">
          <dl className="space-y-2 text-sm">
            <Row
              label="Average"
              value={data.turnaround.avgHours === null ? "—" : `${data.turnaround.avgHours} h`}
            />
            <Row
              label="Fastest"
              value={data.turnaround.fastestHours === null ? "—" : `${data.turnaround.fastestHours} h`}
            />
            <Row label="Over 24h" value={String(data.turnaround.delayedCount)} />
            <Row
              label="Within 24h (target 95%)"
              value={
                data.turnaround.within24hPct === null ? "—" : `${data.turnaround.within24hPct}%`
              }
            />
          </dl>
        </Panel>

        <Panel title="AI Usage">
          <dl className="space-y-2 text-sm">
            <Row label="AI-drafted versions" value={String(data.aiUsage.aiGeneratedVersions)} />
            <Row label="Manual versions" value={String(data.aiUsage.manualVersions)} />
            <Row
              label="AI adoption (target 90%)"
              value={data.aiUsage.adoptionPct === null ? "—" : `${data.aiUsage.adoptionPct}%`}
            />
          </dl>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Pipeline">
          <dl className="space-y-2 text-sm">
            {data.pipeline.map((s) => (
              <Row
                key={s.stage}
                label={s.label}
                value={`${s.count} · ${formatMoney(s.value)}`}
              />
            ))}
          </dl>
        </Panel>

        <Panel title="Assets Created This Week">
          <dl className="space-y-2 text-sm">
            <Row label="Templates" value={String(data.assetsCreated.templates)} />
            <Row label="Demos" value={String(data.assetsCreated.demos)} />
            <Row label="Knowledge" value={String(data.assetsCreated.knowledge)} />
            <Row label="Total" value={String(data.assetsCreated.total)} />
          </dl>
        </Panel>
      </div>

      <Panel title="Demo Performance by Technology">
        {data.demoPerformance.length === 0 ? (
          <p className="text-sm text-gray-400">No demos in the library yet.</p>
        ) : (
          <dl className="space-y-2 text-sm">
            {data.demoPerformance.map((d) => (
              <Row
                key={d.technology}
                label={d.technology}
                value={`${d.count} demo(s) · ${d.avgScore === null ? "unrated" : `${d.avgScore} / 5`}`}
              />
            ))}
          </dl>
        )}
      </Panel>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Win / Loss ({data.winLoss.won} won, {data.winLoss.lost} lost
          {data.winLoss.winRatePct !== null ? ` · ${data.winLoss.winRatePct}%` : ""})
        </h2>
        <TableShell headers={["Engagement", "Outcome", "Competitor", "Reason", "Deal size"]}>
          {data.winLoss.records.length === 0 ? (
            <EmptyRow colSpan={5} message="No engagements closed this week." />
          ) : (
            data.winLoss.records.map((r, i) => (
              <tr key={`${r.engagement}-${i}`}>
                <td className="px-4 py-2.5 text-gray-900">{r.engagement}</td>
                <td className="px-4 py-2.5">
                  <StatusPill status={r.outcome} />
                </td>
                <td className="px-4 py-2.5 text-gray-600">{r.competitor ?? "—"}</td>
                <td className="px-4 py-2.5 capitalize text-gray-600">
                  {r.reasonCategory?.replace(/-/g, " ") ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-gray-900">{formatMoney(r.dealSize)}</td>
              </tr>
            ))
          )}
        </TableShell>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-50 pb-1.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
