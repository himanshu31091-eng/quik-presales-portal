"use client";

/**
 * SA-B.3 — Billing panel with dummy Mark paid / Mark failed buttons.
 *
 * Lists invoices (newest first) with a status badge. Pending invoices can
 * be resolved to paid or failed — this is the stand-in for Stripe webhook
 * handling until real integration.
 */

import { useState } from "react";
import { useOnceEffect } from "@/lib/hooks/useOnceEffect";
import { CreditCard, CheckCircle2, XCircle, Plus } from "lucide-react";
import { Skeleton } from "@quikit/ui";

interface Invoice {
  id: string;
  planSlug: string;
  amountCents: number;
  amountDollars: string;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  failedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface Data {
  invoices: Invoice[];
  totals: { totalDollars: string; paidDollars: string; failedDollars: string; pendingDollars: string };
}

export function BillingPanel({ orgId }: { orgId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/super/invoices/${orgId}`);
      const j = await r.json();
      if (j.success) setData(j.data);
    } finally {
      setLoading(false);
    }
  }

  useOnceEffect(() => {
    load();
  }, [orgId]);

  async function resolve(invoiceId: string, outcome: "paid" | "failed") {
    setPending((s) => new Set(s).add(invoiceId));
    try {
      await fetch(`/api/super/invoices/${orgId}/${invoiceId}/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      await load();
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(invoiceId);
        return n;
      });
    }
  }

  async function generateManual() {
    setGenerating(true);
    try {
      const r = await fetch(`/api/super/invoices/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!j.success) alert(j.error);
      load();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Billing</h2>
        </div>
        <button
          type="button"
          onClick={generateManual}
          disabled={generating}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Generate invoice
        </button>
      </header>

      {loading ? (
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2.5 w-1/2" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : !data || data.invoices.length === 0 ? (
        <div className="p-5 text-gray-400 text-sm">No invoices yet. Click &quot;Generate invoice&quot; or wait for the monthly cron.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-5 bg-gray-50/50 border-b border-gray-100">
            <Total label="Paid" value={`$${data.totals.paidDollars}`} color="text-green-700" />
            <Total label="Pending" value={`$${data.totals.pendingDollars}`} color="text-amber-700" />
            <Total label="Failed" value={`$${data.totals.failedDollars}`} color="text-red-700" />
            <Total label="Total" value={`$${data.totals.totalDollars}`} color="text-gray-900" />
          </div>
          <ul className="divide-y divide-gray-100">
            {data.invoices.map((inv) => {
              const statusClr =
                inv.status === "paid" ? "text-green-700 bg-green-50" :
                inv.status === "failed" ? "text-red-700 bg-red-50" :
                inv.status === "refunded" ? "text-gray-600 bg-gray-100" :
                "text-amber-700 bg-amber-50";
              return (
                <li key={inv.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 tabular-nums">{inv.currency} {inv.amountDollars}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${statusClr}`}>{inv.status}</span>
                      <span className="text-xs text-gray-500 font-mono">{inv.planSlug}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(inv.periodStart).toLocaleDateString()} — {new Date(inv.periodEnd).toLocaleDateString()}
                      {inv.paidAt && ` · Paid ${new Date(inv.paidAt).toLocaleDateString()}`}
                      {inv.failedAt && ` · Failed ${new Date(inv.failedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  {inv.status === "pending" && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => resolve(inv.id, "paid")}
                        disabled={pending.has(inv.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Paid
                      </button>
                      <button
                        type="button"
                        onClick={() => resolve(inv.id, "failed")}
                        disabled={pending.has(inv.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <XCircle className="h-3 w-3" />
                        Failed
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Total({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
