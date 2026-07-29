"use client";

/**
 * SA-C.2 — Per-tenant analytics tab.
 */

import { useState } from "react";
import { useOnceEffect } from "@/lib/hooks/useOnceEffect";
import { BarChart3 } from "lucide-react";

interface Data {
  windowDays: number;
  dauTrend: { date: string; activeUsers: number }[];
  api: {
    totalCalls: number;
    totalErrors: number;
    errorRatePct: number;
    topEndpoints: { pathPattern: string; calls: number; errors: number; avgMs: number }[];
  };
  gates: {
    blockedApps: { slug: string; name: string; reason: string | null }[];
    disabledModules: { appSlug: string; moduleKey: string }[];
  };
  usage: { kpiCount: number };
  billing: {
    invoicesPaidDollars: string;
    invoicesFailedDollars: string;
    invoicesPendingDollars: string;
    recentInvoices: { amountDollars: string; status: string; periodStart: string }[];
  };
}

export function AnalyticsPanel({ orgId }: { orgId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useOnceEffect(() => {
    fetch(`/api/super/analytics/org/${orgId}`)
      .then((r) => r.json())
      .then((j) => j.success && setData(j.data))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <div className="text-gray-400 text-sm">Loading analytics...</div>;
  if (!data) return null;

  const maxActive = Math.max(1, ...data.dauTrend.map((d) => d.activeUsers));

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-gray-500" />
        <h2 className="font-semibold text-gray-900">Analytics (last {data.windowDays} days)</h2>
      </header>

      {/* DAU sparkline */}
      <div className="p-5 border-b border-gray-100">
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Daily active users</p>
        {data.dauTrend.length === 0 ? (
          <p className="text-sm text-gray-400">No login activity in window.</p>
        ) : (
          <div className="flex items-end gap-1 h-20">
            {data.dauTrend.map((d) => {
              const height = Math.round((d.activeUsers / maxActive) * 100);
              return (
                <div key={d.date} className="flex-1 relative group">
                  <div
                    className="w-full rounded-t bg-indigo-500 hover:bg-indigo-600"
                    style={{ height: `${height}%`, minHeight: d.activeUsers > 0 ? "2px" : "0" }}
                  />
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                    {d.date}: {d.activeUsers}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* API summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 border-b border-gray-100">
        <Stat label="Total calls" value={data.api.totalCalls.toLocaleString()} />
        <Stat label="Errors" value={data.api.totalErrors.toLocaleString()} color={data.api.totalErrors > 0 ? "text-red-700" : undefined} />
        <Stat label="Error rate" value={`${data.api.errorRatePct}%`} color={data.api.errorRatePct > 5 ? "text-amber-700" : undefined} />
      </div>

      {/* Top endpoints */}
      {data.api.topEndpoints.length > 0 && (
        <div className="p-5 border-b border-gray-100">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Top endpoints</p>
          <ul className="space-y-1">
            {data.api.topEndpoints.map((e) => (
              <li key={e.pathPattern} className="flex items-center justify-between text-sm">
                <code className="font-mono text-xs text-gray-700 truncate">{e.pathPattern}</code>
                <span className="text-gray-600 tabular-nums whitespace-nowrap ml-3">
                  {e.calls.toLocaleString()} calls
                  {e.errors > 0 && <span className="text-red-600 ml-2">{e.errors} errors</span>}
                  <span className="text-gray-400 ml-2">{e.avgMs}ms avg</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gates summary */}
      {(data.gates.blockedApps.length > 0 || data.gates.disabledModules.length > 0) && (
        <div className="p-5 border-b border-gray-100">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Active restrictions</p>
          <div className="space-y-1 text-sm">
            {data.gates.blockedApps.map((a) => (
              <div key={a.slug} className="text-red-700">
                App blocked: <strong>{a.name}</strong>
                {a.reason && <span className="text-gray-600"> — {a.reason}</span>}
              </div>
            ))}
            {data.gates.disabledModules.length > 0 && (
              <div className="text-amber-700">{data.gates.disabledModules.length} modules disabled</div>
            )}
          </div>
        </div>
      )}

      {/* Billing summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5">
        <Stat label="Paid (L12)" value={`$${data.billing.invoicesPaidDollars}`} color="text-green-700" />
        <Stat label="Pending (L12)" value={`$${data.billing.invoicesPendingDollars}`} color="text-amber-700" />
        <Stat label="Failed (L12)" value={`$${data.billing.invoicesFailedDollars}`} color="text-red-700" />
      </div>
    </section>
  );
}

function Stat({ label, value, color = "text-gray-900" }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-xl font-semibold mt-1 tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
