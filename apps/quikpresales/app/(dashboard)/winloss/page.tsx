"use client";

import { useState } from "react";
import { Select } from "@quikit/ui";
import { useApiQuery, formatMoney, formatDate } from "@/lib/api-client";
import {
  PageHeader,
  Panel,
  StatTile,
  TableShell,
  StatusPill,
  EmptyRow,
  Loading,
  ErrorNote,
} from "@/components/ui-kit";

interface WinLossRow {
  id: string;
  outcome: string;
  competitor: string | null;
  reasonCategory: string | null;
  reasonText: string | null;
  lessons: string | null;
  dealSize: string | null;
  createdAt: string;
  engagement: { title: string; industry: string | null };
}

interface WinLossResponse {
  data: WinLossRow[];
  pagination: { total: number };
  analysis: {
    byOutcome: Record<string, number>;
    byReason: Record<string, number>;
  };
}

export default function WinLossPage() {
  const [outcome, setOutcome] = useState("");

  const params = new URLSearchParams({ limit: "100" });
  if (outcome) params.set("outcome", outcome);

  const { data, isLoading, error } = useApiQuery<WinLossResponse>(
    ["winloss", outcome],
    `/api/winloss?${params}`,
  );

  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error={error} />;

  const won = data?.analysis.byOutcome.won ?? 0;
  const lost = data?.analysis.byOutcome.lost ?? 0;
  const total = won + lost;
  const reasons = Object.entries(data?.analysis.byReason ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Win / Loss Analysis"
        subtitle="Capture the outcome of every closed engagement, and feed the lessons back into templates"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Won" value={won} />
        <StatTile label="Lost" value={lost} />
        <StatTile
          label="Win Rate"
          value={total > 0 ? `${Math.round((won / total) * 100)}%` : "—"}
          hint={total === 0 ? "No closed engagements yet" : `${total} closed`}
        />
      </div>

      {reasons.length > 0 ? (
        <Panel title="Reasons">
          <ul className="space-y-2">
            {reasons.map(([reason, count]) => (
              <li key={reason} className="flex items-center gap-3">
                <span className="w-48 shrink-0 truncate text-sm capitalize text-gray-700">
                  {reason.replace(/-/g, " ")}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
                  <div
                    className="h-full rounded bg-accent-500"
                    style={{ width: `${(count / Math.max(...reasons.map((r) => r[1]))) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm text-gray-900">{count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div>
        <div className="mb-3">
          <Select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            options={[
              { value: "", label: "All outcomes" },
              { value: "won", label: "Won" },
              { value: "lost", label: "Lost" },
            ]}
            className="max-w-[180px]"
          />
        </div>

        <TableShell
          headers={["Engagement", "Outcome", "Competitor", "Reason", "Deal size", "Captured"]}
        >
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow
              colSpan={6}
              message="No win/loss records yet. Close an engagement, then record its outcome."
            />
          ) : (
            data?.data.map((w) => (
              <tr key={w.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-900">{w.engagement.title}</p>
                  {w.engagement.industry ? (
                    <p className="text-xs text-gray-500">{w.engagement.industry}</p>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={w.outcome} />
                </td>
                <td className="px-4 py-2.5 text-gray-600">{w.competitor ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  <p className="capitalize">{w.reasonCategory?.replace(/-/g, " ") ?? "—"}</p>
                  {w.reasonText ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{w.reasonText}</p>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-gray-900">{formatMoney(w.dealSize)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(w.createdAt)}</td>
              </tr>
            ))
          )}
        </TableShell>
      </div>
    </div>
  );
}
