"use client";

/**
 * SA-B.6 — Broadcasts admin page.
 *
 * List + create platform announcements. Each tenant sees active announcements
 * as a banner via @quikit/ui's BroadcastBanner.
 */

import { useEffect, useState } from "react";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { SlidePanel, EmptyState, CardRowSkeleton, severityClass, severityIcon, useConfirm } from "@quikit/ui";

interface Broadcast {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  targetOrgIds: string[];
  targetAppSlugs: string[];
  startsAt: string;
  endsAt: string | null;
  createdBy: string;
  createdAt: string;
  dismissalCount: number;
}

const defaultForm = {
  title: "",
  body: "",
  severity: "info" as "info" | "warning" | "critical",
  targetOrgIdsCSV: "",
  targetAppSlugsCSV: "",
  startsAt: "",
  endsAt: "",
};

export default function BroadcastsPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/super/broadcasts");
      const j = await r.json();
      if (j.success) setItems(j.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title.trim(),
        body: form.body.trim(),
        severity: form.severity,
        targetOrgIds: form.targetOrgIdsCSV.split(",").map((s) => s.trim()).filter(Boolean),
        targetAppSlugs: form.targetAppSlugsCSV.split(",").map((s) => s.trim()).filter(Boolean),
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
      };
      const r = await fetch("/api/super/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed to create");
        return;
      }
      setOpen(false);
      setForm(defaultForm);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: "Delete this broadcast?", description: "Users who haven't dismissed it won't see it anymore.", confirmLabel: "Delete", tone: "danger" }))) return;
    const r = await fetch(`/api/super/broadcasts/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.success) load();
  }

  return (
    <div className="p-4 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900">Broadcasts</h1>
          <p className="text-sm text-slate-500 mt-2">Platform-wide announcements shown as banners in every app.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          New broadcast
        </button>
      </div>

      {loading ? (
        <CardRowSkeleton count={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={Megaphone} message="No broadcasts yet. Create an announcement to push a banner to every tenant." />
      ) : (
        <div className="space-y-3">
          {items.map((b) => {
            const Icon = severityIcon(b.severity);
            const now = Date.now();
            const startsAt = new Date(b.startsAt).getTime();
            const endsAt = b.endsAt ? new Date(b.endsAt).getTime() : null;
            const isActive = startsAt <= now && (endsAt === null || endsAt >= now);
            return (
              <div key={b.id} className="rounded-2xl bg-white/70 backdrop-blur-sm border border-white/60 p-5 flex items-start gap-4 shadow-sm">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${severityClass(b.severity, "badge")}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{b.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded ${isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${severityClass(b.severity, "badge")}`}>{b.severity}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{b.body}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>Starts {new Date(b.startsAt).toLocaleString()}</span>
                    {b.endsAt && <span>Ends {new Date(b.endsAt).toLocaleString()}</span>}
                    <span>{b.dismissalCount} dismissals</span>
                    {b.targetOrgIds.length > 0 && <span>{b.targetOrgIds.length} tenants targeted</span>}
                    {b.targetAppSlugs.length > 0 && <span>Apps: {b.targetAppSlugs.join(", ")}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id)}
                  className="text-gray-400 hover:text-red-600"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <SlidePanel open={open} onClose={() => setOpen(false)} title="New broadcast">
        <form onSubmit={handleCreate} className="space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={120}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Message</span>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={4}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Severity</span>
            <select
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as "info" | "warning" | "critical" }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="info">Info (blue)</option>
              <option value="warning">Warning (amber)</option>
              <option value="critical">Critical (red)</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Target tenants (comma-separated IDs, empty = all)</span>
            <input
              type="text"
              value={form.targetOrgIdsCSV}
              onChange={(e) => setForm((f) => ({ ...f, targetOrgIdsCSV: e.target.value }))}
              placeholder="e.g. ckabc123,ckdef456"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Target apps (slugs, empty = all)</span>
            <input
              type="text"
              value={form.targetAppSlugsCSV}
              onChange={(e) => setForm((f) => ({ ...f, targetAppSlugsCSV: e.target.value }))}
              placeholder="e.g. quikscale,admin"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Starts at</span>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Ends at (optional)</span>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
