"use client";

/**
 * Super Admin: App Registry — /apps-admin
 *
 * Manage the platform's app catalog. Publish/unpublish apps,
 * view OAuth client details, manage app metadata.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Plus,
  ExternalLink,
  Key,
  Settings,
  Search,
  Activity,
  RefreshCw,
} from "lucide-react";
import { SlidePanel, Pagination, EmptyState, Select, CardRowSkeleton, useConfirm } from "@quikit/ui";

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  baseUrl: string;
  status: string;
  createdAt: string;
  hasOAuthClient: boolean;
}

const STATUSES = ["active", "coming_soon", "disabled"];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-50 text-green-700",
    coming_soon: "bg-amber-50 text-amber-700",
    disabled: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    active: "Active",
    coming_soon: "Coming Soon",
    disabled: "Disabled",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status] || "bg-gray-100 text-gray-600"}`}
    >
      {labels[status] || status}
    </span>
  );
}

export default function AppRegistryPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Create panel
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    slug: "",
    baseUrl: "",
    description: "",
    status: "active",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Health probe (manual trigger of the health-check cron)
  const [probing, setProbing] = useState(false);
  const [lastProbeAt, setLastProbeAt] = useState<string | null>(null);
  const [probeSummary, setProbeSummary] = useState<{ up: number; down: number; degraded: number } | null>(null);

  // Edit panel
  const [editOpen, setEditOpen] = useState(false);
  const [editApp, setEditApp] = useState<AppInfo | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    baseUrl: "",
    description: "",
    status: "",
  });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  const fetchApps = useCallback(() => {
    setLoading(true);
    fetch(`/api/super/apps?page=${page}&limit=20&search=${encodeURIComponent(search)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setApps(j.data);
          setTotalPages(j.pagination.totalPages);
          setTotal(j.pagination.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  // Reset page to 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Fetch last probe timestamp on mount
  useEffect(() => {
    fetch("/api/super/cron/last-run")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setLastProbeAt(j.data.healthCheck);
      })
      .catch(() => {});
  }, []);

  // Run health-check NOW + refresh the "last probe at" timestamp
  async function probeAllApps() {
    setProbing(true);
    setProbeSummary(null);
    try {
      const r = await fetch("/api/super/cron/health-check", { credentials: "include" });
      const j = await r.json();
      if (j.success) {
        setLastProbeAt(new Date().toISOString());
        setProbeSummary({ up: j.data.up ?? 0, down: j.data.down ?? 0, degraded: j.data.degraded ?? 0 });
      }
    } finally {
      setProbing(false);
    }
  }

  function formatRelative(iso: string | null): string {
    if (!iso) return "never probed";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function openEdit(app: AppInfo) {
    setEditApp(app);
    setEditForm({
      name: app.name,
      baseUrl: app.baseUrl,
      description: app.description || "",
      status: app.status,
    });
    setEditError("");
    setEditOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/super/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to register app");
      setCreateOpen(false);
      setCreateForm({
        name: "",
        slug: "",
        baseUrl: "",
        description: "",
        status: "active",
      });
      fetchApps();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to register app",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editApp) return;
    setEditing(true);
    setEditError("");
    try {
      const res = await fetch(`/api/super/apps/${editApp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to update app");
      setEditOpen(false);
      setEditApp(null);
      fetchApps();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update app",
      );
    } finally {
      setEditing(false);
    }
  }

  async function handleDisable(app: AppInfo) {
    if (!(await confirm({ title: `Disable "${app.name}"?`, description: "This app will no longer be reachable to any tenant until re-enabled.", confirmLabel: "Disable", tone: "danger" }))) return;
    try {
      const res = await fetch(`/api/super/apps/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to disable app");
      fetchApps();
    } catch {
      // silent
    }
  }

  const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400";
  const labelCls = "text-xs font-medium text-gray-600 block mb-1.5";

  return (
    <div>
      {/* Page header */}
      <div className="px-4 pt-6 pb-5 md:px-10 md:pt-10 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900">App Registry</h1>
          <p className="text-sm text-slate-500 mt-2">
            {total} apps registered on the platform
          </p>
          <p className="text-xs text-slate-400 mt-1.5">
            Last probe: <span className="text-slate-600">{formatRelative(lastProbeAt)}</span>
            {probeSummary && (
              <span className="ml-2">
                <span className="text-emerald-600">{probeSummary.up} up</span>
                {probeSummary.degraded > 0 && <span className="text-amber-600 ml-2">{probeSummary.degraded} degraded</span>}
                {probeSummary.down > 0 && <span className="text-red-600 ml-2">{probeSummary.down} down</span>}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={probeAllApps}
            disabled={probing}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white/70 backdrop-blur-sm border border-white/60 hover:bg-white transition-colors shadow-sm disabled:opacity-50"
            title="Probe every app's /api/health now and record the result"
          >
            {probing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            {probing ? "Probing..." : "Probe all"}
          </button>
          <button
            onClick={() => {
              setCreateError("");
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" /> Register App
          </button>
        </div>
      </div>

      {/* Controls bar */}
      <div className="px-4 md:px-6 py-3 border-b border-gray-200 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Card grid */}
      <div className="px-4 md:px-6 py-4">
        {loading ? (
          <CardRowSkeleton count={6} />
        ) : apps.length === 0 ? (
          <EmptyState icon={LayoutGrid} message="No apps registered yet." />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
                  onClick={() => router.push(`/app-registry/${app.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {app.name}
                      </h3>
                      <p className="text-xs text-gray-500">{app.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={app.status} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(app);
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Edit app"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {app.description && (
                    <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                      {app.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> {app.baseUrl}
                    </span>
                    {app.hasOAuthClient ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-green-50 text-green-700 text-[11px] font-medium">
                        <Key className="h-3 w-3" /> OAuth
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-medium">
                        <Key className="h-3 w-3" /> No OAuth
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination page={page} totalPages={totalPages} total={total} limit={20} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Create slide-in panel */}
      <SlidePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register App"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-app-form"
              disabled={creating}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {creating ? "Registering..." : "Register"}
            </button>
          </div>
        }
      >
        {createError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {createError}
          </div>
        )}
        <form
          id="create-app-form"
          onSubmit={handleCreate}
          className="space-y-5"
        >
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  name: e.target.value,
                  slug: slugify(e.target.value),
                })
              }
              className={inputCls}
              placeholder="QuikScale"
            />
          </div>
          <div>
            <label className={labelCls}>Slug</label>
            <input
              type="text"
              required
              value={createForm.slug}
              onChange={(e) =>
                setCreateForm({ ...createForm, slug: e.target.value })
              }
              className={`${inputCls} bg-gray-50`}
              placeholder="quikscale"
            />
            <p className="text-xs text-gray-400 mt-1">
              Auto-generated from name.
            </p>
          </div>
          <div>
            <label className={labelCls}>Base URL</label>
            <input
              type="url"
              required
              value={createForm.baseUrl}
              onChange={(e) =>
                setCreateForm({ ...createForm, baseUrl: e.target.value })
              }
              className={inputCls}
              placeholder="https://app.quikit.com"
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={createForm.description}
              onChange={(e) =>
                setCreateForm({ ...createForm, description: e.target.value })
              }
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Brief description of the app..."
            />
          </div>
          <div>
            <Select
              label="Status"
              value={createForm.status}
              onChange={(e) =>
                setCreateForm({ ...createForm, status: e.target.value })
              }
              options={[
                { value: "active", label: "Active" },
                { value: "coming_soon", label: "Coming Soon" },
                { value: "disabled", label: "Disabled" },
              ]}
            />
          </div>
        </form>
      </SlidePanel>

      {/* Edit slide-in panel */}
      <SlidePanel
        open={editOpen && !!editApp}
        onClose={() => setEditOpen(false)}
        title="Edit App"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {editApp && editApp.status !== "disabled" && (
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  handleDisable(editApp);
                }}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Disable
              </button>
            )}
            <button
              type="submit"
              form="edit-app-form"
              disabled={editing}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {editing ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      >
        {editError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {editError}
          </div>
        )}
        <form id="edit-app-form" onSubmit={handleEdit} className="space-y-5">
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              required
              value={editForm.name}
              onChange={(e) =>
                setEditForm({ ...editForm, name: e.target.value })
              }
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Slug</label>
            <input
              type="text"
              disabled
              value={editApp?.slug || ""}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-500"
            />
          </div>
          <div>
            <label className={labelCls}>Base URL</label>
            <input
              type="url"
              required
              value={editForm.baseUrl}
              onChange={(e) =>
                setEditForm({ ...editForm, baseUrl: e.target.value })
              }
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
          <div>
            <Select
              label="Status"
              value={editForm.status}
              onChange={(e) =>
                setEditForm({ ...editForm, status: e.target.value })
              }
              options={[
                { value: "active", label: "Active" },
                { value: "coming_soon", label: "Coming Soon" },
                { value: "disabled", label: "Disabled" },
              ]}
            />
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
