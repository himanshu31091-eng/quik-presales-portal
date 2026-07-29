"use client";

/**
 * SA-B.5 — Health panel on tenant detail page.
 */

import { useState } from "react";
import { useOnceEffect } from "@/lib/hooks/useOnceEffect";
import { Activity, CheckCircle2, AlertTriangle, AlertCircle, Users, Zap, Clock } from "lucide-react";

interface HealthData {
  org: { id: string; name: string; slug: string; plan: string; status: string; createdAt: string };
  healthScore: number;
  signals: {
    memberCount: number;
    activeUserCount7d: number;
    kpiCount: number;
    kpisLoggedThisWeek: number;
    disabledModuleCount: number;
    blockedAppCount: number;
    apiCallCount7d: number;
    sessionsLast30d: number;
    lastLoginAt: string | null;
    lastLoginUserId: string | null;
    lastInvoice: {
      status: string;
      amountDollars: string;
      currency: string;
      periodStart: string;
      paidAt: string | null;
      failedAt: string | null;
    } | null;
  };
}

function scoreColor(score: number) {
  if (score >= 80) return { bg: "bg-green-50", text: "text-green-700", ring: "ring-green-500" };
  if (score >= 50) return { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-500" };
  return { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-500" };
}

export function HealthPanel({ orgId }: { orgId: string }) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useOnceEffect(() => {
    fetch(`/api/super/org-health/${orgId}`)
      .then((r) => r.json())
      .then((j) => j.success && setData(j.data))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <div className="text-gray-400 text-sm">Loading health...</div>;
  if (!data) return null;

  const sc = scoreColor(data.healthScore);
  const s = data.signals;

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Organization health</h2>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg ${sc.bg} ring-1 ${sc.ring}/20`}>
          <span className={`text-xs font-semibold ${sc.text}`}>Score</span>
          <span className={`text-lg font-bold tabular-nums ${sc.text}`}>{data.healthScore}</span>
          <span className={`text-xs ${sc.text}`}>/ 100</span>
        </div>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5">
        <Signal icon={Users} label="Members" value={s.memberCount} />
        <Signal icon={Users} label="Active 7d" value={s.activeUserCount7d} />
        <Signal icon={Zap} label="API calls 7d" value={s.apiCallCount7d.toLocaleString()} />
        <Signal icon={Clock} label="Sessions 30d" value={s.sessionsLast30d} />
        <Signal icon={CheckCircle2} label="KPIs total" value={s.kpiCount} />
        <Signal icon={CheckCircle2} label="KPIs this week" value={s.kpisLoggedThisWeek} />
        <Signal icon={AlertTriangle} label="Modules disabled" value={s.disabledModuleCount} warning={s.disabledModuleCount > 3} />
        <Signal icon={AlertTriangle} label="Apps blocked" value={s.blockedAppCount} warning={s.blockedAppCount > 0} />
      </div>
      <div className="px-5 pb-5 pt-0 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="p-3 rounded-lg bg-gray-50">
          <p className="text-xs uppercase tracking-wider text-gray-500">Last login</p>
          <p className="font-medium text-gray-900">
            {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : "Never logged in"}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-gray-50">
          <p className="text-xs uppercase tracking-wider text-gray-500">Last invoice</p>
          <p className="font-medium text-gray-900">
            {s.lastInvoice ? (
              <>
                {s.lastInvoice.currency} {s.lastInvoice.amountDollars} —{" "}
                <span className={s.lastInvoice.status === "paid" ? "text-green-700" : s.lastInvoice.status === "failed" ? "text-red-700" : "text-gray-600"}>
                  {s.lastInvoice.status}
                </span>
              </>
            ) : (
              "No invoices yet"
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

function Signal({ icon: Icon, label, value, warning }: { icon: typeof Activity; label: string; value: string | number; warning?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-gray-50">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${warning ? "text-amber-600" : "text-gray-400"}`} />
        <span className="text-xs uppercase tracking-wider text-gray-500">{label}</span>
      </div>
      <p className={`text-xl font-semibold mt-1 tabular-nums ${warning ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
