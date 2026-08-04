"use client";

import Link from "next/link";
import { Select } from "@quikit/ui";
import { useApiQuery, formatDate } from "@/lib/api-client";
import { useDisplayCurrency } from "@/lib/hooks/useCurrency";
import {
  KpiCard,
  KPI_ICONS,
  QuickActions,
  PracticePipelinePanel,
  type PracticeRow,
  type Trend,
  type QuickAction,
} from "@/components/dashboard-widgets";
import {
  Briefcase,
  FileSearch,
  FileText,
  Calculator,
  LayoutTemplate,
  Library,
} from "lucide-react";
import {
  PageHeader,
  Panel,
  StatusPill,
  Loading,
  ErrorNote,
} from "@/components/ui-kit";

interface MoneyBucket {
  currency: string | null;
  minorUnits: string | null;
}

interface DashboardData {
  kpis: {
    activeEngagements: number;
    pipelineByCurrency: MoneyBucket[];
    openRfps: number;
    winRatePct: number | null;
    demoSatisfaction: number | null;
    ratedDemos: number;
    reusableAssets: number;
  };
  pipeline: { stage: string; label: string; count: number; money: MoneyBucket[] }[];
  proposals: Record<string, number>;
  dealHealth: Record<string, number>;
  assets: { templates: number; demos: number; knowledge: number };
  thisPeriod: { days: number; newEngagements: number; newProposals: number; newRfps: number };
  practicePipeline?: {
    derived: boolean;
    dealsWithValue: number;
    multiPracticeDeals: number;
    rows: PracticeRow[];
  };
  trends?: {
    newEngagements: Trend;
    newProposals: Trend;
    newRfps: Trend;
  };
  upcomingCloses: {
    id: string;
    title: string;
    stage: string;
    estRevenue: string | null;
    currency: string | null;
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

/**
 * Quick actions. Every tile points at a page that exists — a tile leading nowhere
 * trains people to distrust the whole panel, so "Solution Architecture" and
 * "Meetings" from the design are absent until those modules do.
 */
const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Opportunity", href: "/engagements", icon: Briefcase },
  { label: "RFP Manager", href: "/rfps", icon: FileSearch },
  { label: "Create Proposal", href: "/proposals", icon: FileText },
  { label: "Build Estimation", href: "/estimates", icon: Calculator },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Knowledge Base", href: "/knowledge", icon: Library },
];

export default function DashboardPage() {
  const {
    formatTotal,
    totalMajor,
    formatConverted,
    displayCurrency,
    setDisplayCurrency,
    currencies,
    rateSource,
    rateAsOf,
  } = useDisplayCurrency();

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
        actions={
          <div className="flex flex-col items-end gap-1">
            <Select
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value)}
              options={currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
              className="min-w-[190px]"
            />
            {/* Never present a converted figure without saying how current the
                rate behind it is. */}
            {rateSource ? (
              <span className="text-xs text-gray-400">
                {rateSource === "live" ? "Live rates" : "Offline rates"}
                {rateAsOf ? ` · ${rateAsOf.replace(/ \+0000$/, "")}` : ""}
              </span>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Open Opportunities"
          value={kpis.activeEngagements}
          icon={KPI_ICONS.opportunities}
          tone="blue"
          href="/engagements"
          trend={data.trends?.newEngagements}
          periodLabel={`new in ${thisPeriod.days}d`}
        />
        <KpiCard
          label="Pipeline Value"
          value={formatTotal(kpis.pipelineByCurrency)}
          icon={KPI_ICONS.pipeline}
          tone="rose"
          // No trend: pipeline value is a snapshot, and comparing it needs
          // historical snapshots this app does not keep.
          hint="Across all open stages"
        />
        <KpiCard
          label="Open RFPs"
          value={kpis.openRfps}
          icon={KPI_ICONS.requests}
          tone="violet"
          href="/rfps"
          trend={data.trends?.newRfps}
          periodLabel={`new in ${thisPeriod.days}d`}
        />
        <KpiCard
          label="Proposal Win Rate"
          value={kpis.winRatePct === null ? "—" : `${kpis.winRatePct}%`}
          icon={KPI_ICONS.winRate}
          tone="green"
          href="/winloss"
          hint={kpis.winRatePct === null ? "No closed deals yet" : "Won vs lost, all time"}
        />
        <KpiCard
          label="Reusable Assets"
          value={kpis.reusableAssets}
          icon={KPI_ICONS.assets}
          tone="amber"
          hint={`Target 100 · ${data.assets.templates} templates, ${data.assets.demos} demos, ${data.assets.knowledge} knowledge`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <QuickActions actions={QUICK_ACTIONS} />
        </div>
        <PracticePipelinePanel
          data={data.practicePipeline}
          formatTotal={formatTotal}
          toMajor={totalMajor}
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
                    {formatTotal(s.money)}
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
                    {formatDate(e.expectedClose)} · {formatConverted(e.estRevenue, e.currency)}
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
