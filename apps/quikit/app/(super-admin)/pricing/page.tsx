"use client";

/**
 * SA-B.2 — Pricing & Plans.
 *
 * Replaces the "coming soon" placeholder with actual Plan CRUD. Plans are the
 * data backing Tenant.plan (a slug string), invoice generation, and the
 * tenant-health panel's "last invoice" display.
 */

import { useEffect, useState } from "react";
import { CreditCard, Plus, Pencil, Trash2 } from "lucide-react";
import { SlidePanel, EmptyState, CardRowSkeleton, useConfirm } from "@quikit/ui";

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number; // cents
  priceYearly: number;
  priceMonthlyDollars: string;
  priceYearlyDollars: string;
  currency: string;
  features: string[];
  limits: Record<string, unknown> | null;
  isActive: boolean;
  sortOrder: number;
  tenantCount: number;
}

const emptyForm = {
  slug: "",
  name: "",
  description: "",
  priceMonthlyDollars: "0",
  priceYearlyDollars: "0",
  currency: "USD",
  featuresCSV: "",
  limitsJSON: "{}",
  isActive: true,
  sortOrder: 0,
};

export default function PricingPage() {
  const confirm = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/super/plans");
      const j = await r.json();
      if (j.success) setPlans(j.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setPanelOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setForm({
      slug: plan.slug,
      name: plan.name,
      description: plan.description ?? "",
      priceMonthlyDollars: (plan.priceMonthly / 100).toFixed(2),
      priceYearlyDollars: (plan.priceYearly / 100).toFixed(2),
      currency: plan.currency,
      featuresCSV: plan.features.join(", "),
      limitsJSON: JSON.stringify(plan.limits ?? {}, null, 2),
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    });
    setError(null);
    setPanelOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let limits: Record<string, unknown> | null;
      try {
        const parsed = form.limitsJSON.trim() ? JSON.parse(form.limitsJSON) : null;
        limits = parsed;
      } catch {
        setError("Limits must be valid JSON");
        setSaving(false);
        return;
      }
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        priceMonthly: Math.round(parseFloat(form.priceMonthlyDollars || "0") * 100),
        priceYearly: Math.round(parseFloat(form.priceYearlyDollars || "0") * 100),
        currency: form.currency,
        features: form.featuresCSV.split(",").map((s) => s.trim()).filter(Boolean),
        limits,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      };

      const url = editing ? `/api/super/plans/${editing.id}` : "/api/super/plans";
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed to save");
        return;
      }
      setPanelOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan: Plan) {
    if (plan.tenantCount > 0) {
      alert(`Cannot delete: ${plan.tenantCount} tenant(s) use this plan. Reassign them first.`);
      return;
    }
    if (!(await confirm({ title: `Delete "${plan.name}"?`, description: "This plan definition will be permanently removed. This cannot be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    const r = await fetch(`/api/super/plans/${plan.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) load();
    else alert(j.error);
  }

  return (
    <div className="p-4 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900">Pricing & Plans</h1>
          <p className="text-sm text-slate-500 mt-2">Plan definitions that back organization billing and feature limits.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          New plan
        </button>
      </div>

      {loading ? (
        <CardRowSkeleton count={4} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          message="No plans defined. Create your first plan to enable invoice generation."
          action={{ label: "New plan", onClick: openCreate }}
        />
      ) : (
        <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-amber-50/60 text-left text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-5 py-3.5">Plan</th>
                <th className="px-5 py-3.5">Monthly</th>
                <th className="px-5 py-3.5">Yearly</th>
                <th className="px-5 py-3.5">Tenants</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map((p) => (
                <tr key={p.id} className="hover:bg-amber-50/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{p.slug}</div>
                  </td>
                  <td className="px-5 py-4 tabular-nums text-slate-700">${p.priceMonthlyDollars}</td>
                  <td className="px-5 py-4 tabular-nums text-slate-700">${p.priceYearlyDollars}</td>
                  <td className="px-5 py-4 tabular-nums text-slate-600">{p.tenantCount}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {p.isActive ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-amber-700 p-1" aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(p)} className="text-slate-400 hover:text-red-600 p-1" aria-label="Delete" disabled={p.tenantCount > 0}>
                        <Trash2 className={`h-4 w-4 ${p.tenantCount > 0 ? "opacity-30 cursor-not-allowed" : ""}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? "Edit plan" : "New plan"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Slug (immutable)</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              disabled={!!editing}
              required
              pattern="[a-z0-9_-]{2,40}"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono disabled:bg-gray-50"
              placeholder="e.g. growth"
            />
            <span className="block text-xs text-gray-500 mt-1">2-40 chars, lowercase, [a-z0-9_-]. Cannot be changed after creation.</span>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Monthly price ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.priceMonthlyDollars}
                onChange={(e) => setForm((f) => ({ ...f, priceMonthlyDollars: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Yearly price ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.priceYearlyDollars}
                onChange={(e) => setForm((f) => ({ ...f, priceYearlyDollars: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Features (comma-separated)</span>
            <input
              type="text"
              value={form.featuresCSV}
              onChange={(e) => setForm((f) => ({ ...f, featuresCSV: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="unlimited_kpis, priority_support"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Limits (JSON)</span>
            <textarea
              value={form.limitsJSON}
              onChange={(e) => setForm((f) => ({ ...f, limitsJSON: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
              placeholder='{"maxUsers": 10, "maxKPIs": 50}'
            />
          </label>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Active
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              Sort order:
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value || "0", 10) }))}
                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm tabular-nums"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setPanelOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Saving..." : editing ? "Save changes" : "Create plan"}
            </button>
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
