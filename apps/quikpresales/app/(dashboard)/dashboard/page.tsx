"use client";

import Link from "next/link";
import { useApiQuery, formatMoney, formatDate } from "@/lib/api-client";
import {
  PageHeader,
  Panel,
  StatTile,
  StatusPill,
  Loading,
  ErrorNote,
} from "@/components/ui-kit";

interface DashboardData {
  kpis: {
    activeEngagements: number;
    pipelineValue: string;
    openRfps: number;
    winRatePct: number | null;
    demoSatisfaction: number | null;
    ratedDemos: number;
    reusableAssets: number;
  };
  pipeline: { stage: string; label: string; count: number; value: string }[];
  proposals: Record<string, number>;
  dealHealth: Record<string, number>;
  assets: { templates: number; demos: number; knowledge: number };
  thisPeriod: { days: number; newEngagements: number; newProposals: number; newRfps: number };
  upcomingCloses: {
    id: string;
    title: string;
    stage: string;
    estRevenue: string | null;
    expectedClose: string | null;
  }[];
  recentActivity: {
    id: string;
    type: string;
    summary: string;
    createdAt: string;
    engagement: { id: string; title: string };
  }[];
}

export default function DashboardPage() {
  const { data, isLoading, error } = useApiQuery<DashboardData>(
    ["dashboard"],
    "/api/dashboard?days=30",
  );

  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const { kpis, thisPeriod } = data;
  const maxStageCount = Math.max(1, ...data.pipeline.map((s) => s.count));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pre-Sales Dashboard"
        subtitle={`Last ${thisPeriod.days} days · ${thisPeriod.newEngagements} new engagements, ${thisPeriod.newProposals} proposals, ${thisPeriod.newRfps} RFPs`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Active Engagements" value={kpis.activeEngagements} href="/engagements" />
        <StatTile label="Pipeline Value" value={formatMoney(kpis.pipelineValue)} />
        <StatTile label="Open RFPs" value={kpis.openRfps} href="/rfps" />
        <StatTile
          label="Win Rate"
          value={kpis.winRatePct === null ? "—" : `${kpis.winRatePct}%`}
          hint={kpis.winRatePct === null ? "No closed deals yet" : undefined}
          href="/winloss"
        />
        <StatTile
          label="Reusable Assets"
          value={kpis.reusableAssets}
          hint={`Target 100 · ${data.assets.templates} templates, ${data.assets.demos} demos, ${data.assets.knowledge} knowledge`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Pipeline by Stage" className="lg:col-span-2">
          {data.pipeline.every((s) => s.count === 0) ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No open engagements yet.{" "}
              <Link href="/engagements" className="text-accent-600 hover:underline">
                Create the first one
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-3">
              {data.pipeline.map((s) => (
                <li key={s.stage} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-sm text-gray-700">{s.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-gray-100">
                    <div
                      className="h-full rounded bg-accent-500"
                      style={{ width: `${(s.count / maxStageCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-medium text-gray-900">
                    {s.count}
                  </span>
                  <span className="w-28 shrink-0 text-right text-xs text-gray-500">
                    {formatMoney(s.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Proposals">
            {Object.keys(data.proposals).length === 0 ? (
              <p className="text-sm text-gray-400">No proposals yet.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(data.proposals).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between">
                    <StatusPill status={status} />
                    <span className="text-sm font-medium text-gray-900">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Deal Health">
            {Object.keys(data.dealHealth).length === 0 ? (
              <p className="text-sm text-gray-400">
                No AI health scores yet — they populate as engagements are updated.
              </p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(data.dealHealth).map(([health, count]) => (
                  <li key={health} className="flex items-center justify-between">
                    <StatusPill status={health} />
                    <span className="text-sm font-medium text-gray-900">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Closing Soon">
          {data.upcomingCloses.length === 0 ? (
            <p className="text-sm text-gray-400">No engagements with an expected close date.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.upcomingCloses.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <Link
                    href={`/engagements/${e.id}`}
                    className="truncate text-sm text-gray-900 hover:underline"
                  >
                    {e.title}
                  </Link>
                  <span className="ml-3 shrink-0 text-xs text-gray-500">
                    {formatDate(e.expectedClose)} · {formatMoney(e.estRevenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent Activity">
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing has happened yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="py-2">
                  <p className="text-sm text-gray-900">{a.summary}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    <Link href={`/engagements/${a.engagement.id}`} className="hover:underline">
                      {a.engagement.title}
                    </Link>{" "}
                    · {new Date(a.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
