"use client";

/**
 * Super Admin: Organizations — /orgs
 *
 * Manage all tenants on the QuikIT platform. List, create, suspend,
 * view details. This is where the QuikIT team manages the multi-tenant
 * lifecycle.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Search,
  Plus,
  Eye,
  Pencil,
  Ban,
} from "lucide-react";
import { SlidePanel, Pagination, EmptyState, Select, TableSkeleton, useConfirm } from "@quikit/ui";
import { INVITE_METHOD, validateSsoEmail } from "@quikit/shared";

interface PlatformApp {
  id: string;
  name: string;
  slug: string;
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  billingEmail?: string;
  memberCount: number;
  createdAt: string;
}

const PLANS = ["startup", "growth", "enterprise"];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    startup: "bg-indigo-50 text-indigo-700",
    growth: "bg-purple-50 text-purple-700",
    enterprise: "bg-amber-50 text-amber-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${styles[plan] || "bg-gray-100 text-gray-600"}`}
    >
      {plan}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-600">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Active
      </span>
    );
  }
  if (status === "suspended") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      {status}
    </span>
  );
}

export default function OrgsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Create panel — FRD FR-SA-001 single-shot org + first OrgAdmin form.
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    name: string;
    slug: string;
    plan: string;
    billingEmail: string;
    appIds: string[];
    admin: {
      firstName: string;
      lastName: string;
      email: string;
      inviteMethod: typeof INVITE_METHOD.SSO | typeof INVITE_METHOD.NATIVE;
    };
  }>({
    name: "",
    slug: "",
    plan: "startup",
    billingEmail: "",
    appIds: [],
    admin: {
      firstName: "",
      lastName: "",
      email: "",
      inviteMethod: INVITE_METHOD.SSO,
    },
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [platformApps, setPlatformApps] = useState<PlatformApp[]>([]);

  // FR-SA-002 — fetch the App registry once on mount so the multi-select
  // can render. We only show active apps because that's what the API will
  // accept on org create (super_admin schema filters on status="active").
  useEffect(() => {
    fetch("/api/super/apps?status=active")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.data)) {
          setPlatformApps(
            j.data.map((a: { id: string; name: string; slug: string }) => ({
              id: a.id,
              name: a.name,
              slug: a.slug,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Edit panel
  const [editOpen, setEditOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<TenantInfo | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    plan: "",
    billingEmail: "",
  });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  const fetchOrgs = useCallback(() => {
    setLoading(true);
    fetch(`/api/super/orgs?page=${page}&limit=20&search=${encodeURIComponent(search)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setTenants(j.data);
          setTotalPages(j.pagination.totalPages);
          setTotal(j.pagination.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  // Reset page to 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === tenants.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tenants.map((t) => t.id)));
    }
  }

  async function handleBulkSuspend() {
    if (!(await confirm({ title: `Suspend ${selected.size} organization(s)?`, description: "This will disable access for all their members until each organization is restored.", confirmLabel: "Suspend", tone: "danger" }))) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/super/orgs/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suspend", ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Bulk operation failed");
      setSelected(new Set());
      fetchOrgs();
    } catch {
      // silently fail — could add toast later
    } finally {
      setBulkLoading(false);
    }
  }

  function openEdit(org: TenantInfo) {
    setEditOrg(org);
    setEditForm({
      name: org.name,
      plan: org.plan,
      billingEmail: org.billingEmail || "",
    });
    setEditError("");
    setEditOpen(true);
  }

  function resetCreateForm() {
    setCreateForm({
      name: "",
      slug: "",
      plan: "startup",
      billingEmail: "",
      // No app is pre-selected — the super admin manually picks every app
      // (including Admin Portal) during org creation.
      appIds: [],
      admin: {
        firstName: "",
        lastName: "",
        email: "",
        inviteMethod: INVITE_METHOD.SSO,
      },
    });
  }

  function toggleCreateAppId(id: string) {
    setCreateForm((prev) => ({
      ...prev,
      appIds: prev.appIds.includes(id)
        ? prev.appIds.filter((x) => x !== id)
        : [...prev.appIds, id],
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      // FR-SA-002 — at least one app required when an admin is being invited.
      if (createForm.appIds.length === 0) {
        throw new Error("Select at least one application for this organisation.");
      }
      // FR-SA-004 — client-side SSO domain validation.
      if (createForm.admin.inviteMethod === INVITE_METHOD.SSO) {
        const err = validateSsoEmail(createForm.admin.email);
        if (err) throw new Error(err);
      }
      const res = await fetch("/api/super/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to create organization");
      setCreateOpen(false);
      resetCreateForm();
      fetchOrgs();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create organization",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrg) return;
    setEditing(true);
    setEditError("");
    try {
      const res = await fetch(`/api/super/orgs/${editOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to update organization");
      setEditOpen(false);
      setEditOrg(null);
      fetchOrgs();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update organization",
      );
    } finally {
      setEditing(false);
    }
  }

  async function handleSuspend(id: string, name: string) {
    if (
      !(await confirm({
        title: `Suspend "${name}"?`,
        description: "This will disable access for all members of the organization until it is restored.",
        confirmLabel: "Suspend",
        tone: "danger",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/super/orgs/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to suspend organization");
      fetchOrgs();
    } catch {
      // silently fail — could add toast later
    }
  }

  /* ── Form field helper ───────────────────────────────── */
  const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400";
  const labelCls = "text-xs font-medium text-gray-600 block mb-1.5";

  return (
    <div>
      {/* Page header */}
      <div className="px-4 pt-6 pb-5 md:px-10 md:pt-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900">Organizations</h1>
          <p className="text-sm text-slate-500 mt-2">
            {total} total organizations on the platform
          </p>
        </div>
        <button
          onClick={() => {
            setCreateError("");
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> New Organization
        </button>
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

      {/* Table */}
      <div className="px-4 md:px-6 py-4">
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : tenants.length === 0 ? (
          <EmptyState icon={Building2} message="No organizations found." />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Mobile card view (<md) */}
            <div className="md:hidden p-3 space-y-2">
              {tenants.map((t) => (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    <Link
                      href={`/organizations/${t.id}`}
                      className="font-medium text-gray-900 hover:underline flex-1 min-w-0 truncate"
                    >
                      {t.name}
                    </Link>
                    <PlanBadge plan={t.plan} />
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{t.slug}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                    </span>
                    <span>
                      Created {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/organizations/${t.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button
                      onClick={() => openEdit(t)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleSuspend(t.id, t.name)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-colors ml-auto"
                    >
                      <Ban className="h-3.5 w-3.5" /> Suspend
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table (md+) — wrapped in overflow-x-auto for narrow tablets */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={tenants.length > 0 && selected.size === tenants.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Organization
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Plan
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Status
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Members
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Created
                  </th>
                  <th className="px-4 py-2.5 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-gray-50/60 transition-colors group"
                  >
                    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/organizations/${t.id}`}
                        className="hover:underline"
                      >
                        <p className="font-medium text-gray-900">{t.name}</p>
                        <p className="text-xs text-gray-500">{t.slug}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge plan={t.plan} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.memberCount}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            router.push(`/organizations/${t.id}`)
                          }
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEdit(t)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleSuspend(t.id, t.name)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Suspend"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination page={page} totalPages={totalPages} total={total} limit={20} onPageChange={setPage} />
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button onClick={handleBulkSuspend} disabled={bulkLoading} className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 rounded-lg">
            {bulkLoading ? "Processing..." : "Suspend"}
          </button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs text-white/70 hover:text-white">
            Clear
          </button>
        </div>
      )}

      {/* Create slide-in panel */}
      <SlidePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Organization"
        subtitle="Add a new organization to the platform"
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
              form="create-org-form"
              disabled={creating}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating..." : "Create"}
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
          id="create-org-form"
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
              placeholder="Acme Corp"
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
              placeholder="acme-corp"
            />
            <p className="text-xs text-gray-400 mt-1">
              Auto-generated from name. Edit if needed.
            </p>
          </div>
          <div>
            <Select
              label="Plan"
              value={createForm.plan}
              onChange={(e) =>
                setCreateForm({ ...createForm, plan: e.target.value })
              }
              options={[
                { value: "startup", label: "Startup" },
                { value: "growth", label: "Growth" },
                { value: "enterprise", label: "Enterprise" },
              ]}
            />
          </div>
          <div>
            <label className={labelCls}>Billing Email</label>
            <input
              type="email"
              value={createForm.billingEmail}
              onChange={(e) =>
                setCreateForm({ ...createForm, billingEmail: e.target.value })
              }
              className={inputCls}
              placeholder="billing@acme.com"
            />
          </div>

          {/* FR-SA-002 — Application Access multi-select. Required.
              Apps selected here are provisioned for the org (OrgAppAccess)
              and granted to the first Org Admin. */}
          <div>
            <label className={labelCls}>
              Application Access <span className="text-red-500">*</span>
            </label>
            {platformApps.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No active applications available.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {platformApps.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={createForm.appIds.includes(a.id)}
                      onChange={() => toggleCreateAppId(a.id)}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-sm">{a.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* FR-SA-001 / FR-SA-003 — first Org Admin block. Role is
              hard-fixed to "Org Admin" per FR-SA-003. */}
          <div className="border-t border-gray-200 pt-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700">First Org Admin</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First Name</label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={createForm.admin.firstName}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      admin: { ...createForm.admin, firstName: e.target.value },
                    })
                  }
                  className={inputCls}
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={createForm.admin.lastName}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      admin: { ...createForm.admin, lastName: e.target.value },
                    })
                  }
                  className={inputCls}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                required
                value={createForm.admin.email}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    admin: { ...createForm.admin, email: e.target.value },
                  })
                }
                className={inputCls}
                placeholder="jane@acme.com"
              />
            </div>

            <div>
              <label className={labelCls}>Role</label>
              {/* FR-SA-003 — read-only Org Admin role. */}
              <input
                type="text"
                disabled
                value="Org Admin"
                className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`}
              />
            </div>

            <div>
              <label className={labelCls}>Invitation Method</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="org-invite-method"
                    value={INVITE_METHOD.SSO}
                    checked={createForm.admin.inviteMethod === INVITE_METHOD.SSO}
                    onChange={() =>
                      setCreateForm({
                        ...createForm,
                        admin: { ...createForm.admin, inviteMethod: INVITE_METHOD.SSO },
                      })
                    }
                    className="mt-0.5 text-indigo-600"
                  />
                  <span className="text-sm">
                    <strong>SSO</strong> — Google or Microsoft sign-in
                  </span>
                </label>
                <label className="flex items-start gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="org-invite-method"
                    value={INVITE_METHOD.NATIVE}
                    checked={createForm.admin.inviteMethod === INVITE_METHOD.NATIVE}
                    onChange={() =>
                      setCreateForm({
                        ...createForm,
                        admin: { ...createForm.admin, inviteMethod: INVITE_METHOD.NATIVE },
                      })
                    }
                    className="mt-0.5 text-indigo-600"
                  />
                  <span className="text-sm">
                    <strong>Native Email</strong> — temporary password via email (Quikit2026)
                  </span>
                </label>
              </div>
            </div>
          </div>
        </form>
      </SlidePanel>

      {/* Edit slide-in panel */}
      <SlidePanel
        open={editOpen && !!editOrg}
        onClose={() => setEditOpen(false)}
        title="Edit Organization"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-org-form"
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
        <form id="edit-org-form" onSubmit={handleEdit} className="space-y-5">
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
              value={editOrg?.slug || ""}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Slug cannot be changed after creation.
            </p>
          </div>
          <div>
            <Select
              label="Plan"
              value={editForm.plan}
              onChange={(e) =>
                setEditForm({ ...editForm, plan: e.target.value })
              }
              options={[
                { value: "startup", label: "Startup" },
                { value: "growth", label: "Growth" },
                { value: "enterprise", label: "Enterprise" },
              ]}
            />
          </div>
          <div>
            <label className={labelCls}>Billing Email</label>
            <input
              type="email"
              value={editForm.billingEmail}
              onChange={(e) =>
                setEditForm({ ...editForm, billingEmail: e.target.value })
              }
              className={inputCls}
            />
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
