"use client";

import Link from "next/link";
import {
  Briefcase,
  FileSearch,
  Trophy,
  Library,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui-kit";

/**
 * Dashboard widgets — KPI cards, quick actions and the trend indicator.
 *
 * Composition over @quikit/ui and Tailwind; nothing here re-implements a shared
 * component.
 */

export interface Trend {
  current: number;
  previous: number;
  /** Null when the previous window was zero — no meaningful percentage exists. */
  deltaPct: number | null;
}

/**
 * A trend delta.
 *
 * Direction is not always "up is good": turnaround time falling is an
 * improvement, so callers pass `goodDirection`.
 */
export function TrendDelta({
  trend,
  goodDirection = "up",
  periodLabel,
}: {
  trend?: Trend | null;
  goodDirection?: "up" | "down";
  periodLabel: string;
}) {
  if (!trend) return null;

  if (trend.deltaPct === null) {
    // "Up from zero" has no percentage. Say what actually happened instead.
    // `periodLabel` already carries the noun ("new in 30d"), so nothing is
    // prefixed here — doing both produced "9 new new in 30d".
    return (
      <p className="mt-1 text-xs text-gray-400">
        {trend.current > 0 ? `${trend.current} ${periodLabel}` : `None ${periodLabel}`}
      </p>
    );
  }

  const rising = trend.deltaPct > 0;
  const flat = trend.deltaPct === 0;
  const good = flat ? null : rising === (goodDirection === "up");
  const Icon: LucideIcon = rising ? ArrowUpRight : ArrowDownRight;

  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-xs",
        good === null ? "text-gray-400" : good ? "text-green-600" : "text-red-600",
      )}
    >
      {flat ? null : <Icon className="h-3 w-3" aria-hidden />}
      <span>
        {flat ? "No change" : `${Math.abs(trend.deltaPct)}%`} {periodLabel}
      </span>
    </p>
  );
}

const CHIP_TONE = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  green: "bg-green-50 text-green-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
} as const;

/** KPI card with a coloured icon chip, matching the shared design. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  href,
  hint,
  trend,
  goodDirection,
  periodLabel = "vs previous period",
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone: keyof typeof CHIP_TONE;
  href?: string;
  hint?: string;
  trend?: Trend | null;
  goodDirection?: "up" | "down";
  periodLabel?: string;
}) {
  const body = (
    <div className="flex items-start gap-3">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", CHIP_TONE[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-semibold text-gray-900">{value}</p>
        {trend ? (
          <TrendDelta trend={trend} goodDirection={goodDirection} periodLabel={periodLabel} />
        ) : hint ? (
          <p className="mt-1 text-xs text-gray-400">{hint}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow">
      {href ? (
        <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/** Icons used by the dashboard's five KPI cards. */
export const KPI_ICONS = {
  opportunities: Briefcase,
  requests: FileSearch,
  winRate: Trophy,
  assets: Library,
  pipeline: DollarSign,
} as const;

/* ─────────────────── Pipeline value by practice ─────────────────── */

export interface PracticeRow {
  practice: string;
  money: { currency: string | null; minorUnits: string | null }[];
}

/**
 * Horizontal bars, deliberately CSS rather than a charting library.
 *
 * One quantity per row on a shared scale needs no chart engine, and adding a
 * dependency for it would be disproportionate — the donut and trend line in the
 * design genuinely do need one.
 *
 * Bar width scales to the largest practice, so the comparison is between
 * practices. `formatTotal` converts each practice's per-currency buckets into the
 * reader's display currency.
 */
export function PracticePipelinePanel({
  data,
  formatTotal,
  toMajor,
}: {
  data?: {
    derived: boolean;
    dealsWithValue: number;
    multiPracticeDeals: number;
    rows: PracticeRow[];
  };
  formatTotal: (buckets: { currency: string | null; minorUnits: string | null }[]) => string;
  /** Converts a practice's buckets to a comparable number, for bar scaling. */
  toMajor: (buckets: { currency: string | null; minorUnits: string | null }[]) => number;
}) {
  if (!data || data.rows.length === 0) {
    return (
      <Panel title="Pipeline Value by Practice">
        <p className="py-6 text-center text-sm text-gray-400">
          No open deals carry both a value and a recognised technology yet.
        </p>
      </Panel>
    );
  }

  const scaled = data.rows.map((r) => ({ ...r, major: toMajor(r.money) }));
  const max = Math.max(1, ...scaled.map((r) => r.major));

  return (
    <Panel title="Pipeline Value by Practice">
      <ul className="space-y-3">
        {scaled.map((r) => (
          <li key={r.practice} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-gray-700">{r.practice}</span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-gray-100">
              <div
                className="h-full rounded bg-accent-500"
                style={{ width: `${Math.max(2, (r.major / max) * 100)}%` }}
              />
            </div>
            <span className="w-32 shrink-0 text-right text-xs text-gray-600">
              {formatTotal(r.money)}
            </span>
          </li>
        ))}
      </ul>

      {/* Never present a derived figure as a recorded one. */}
      {data.derived ? (
        <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
          Practice is inferred from each deal&rsquo;s technology — deals do not yet carry a
          practice field.
          {data.multiPracticeDeals > 0
            ? ` ${data.multiPracticeDeals} deal(s) span more than one practice and are counted once.`
            : ""}
        </p>
      ) : null}
    </Panel>
  );
}

/* ───────────────────────── Quick actions ───────────────────────── */

export interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Quick actions grid.
 *
 * Only actions with a working destination. A tile that leads nowhere trains
 * people to distrust the whole panel.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Panel title="Quick Actions">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex flex-col items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-3 text-center transition-colors hover:border-accent-200 hover:bg-accent-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            <a.icon className="h-5 w-5 text-accent-600" aria-hidden />
            <span className="text-xs font-medium leading-tight text-gray-700">{a.label}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
