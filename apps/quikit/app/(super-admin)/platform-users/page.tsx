"use client";

/**
 * Super Admin: Platform Users — /users-admin
 *
 * View all users across all tenants. Search, filter by tenant,
 * view activity. Platform-wide user management.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  Search,
  Plus,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { SlidePanel, Pagination, EmptyState, TenantPicker, useConfirm, type TenantOption, TableSkeleton } from "@quikit/ui";

interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  lastSignInAt: string | null;
  membershipCount: number;
}

export default function PlatformUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  // UX-8: persist filters to URL query so deep links and browser back/forward
  // preserve the filter state. Read initial values from the URL once.
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [orgId, setOrgId] = useState<string>(() => searchParams.get("orgId") ?? "");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantsLoaded, setTenantsLoaded] = useState(false);

  // Sync filter state back to the URL whenever it changes. We use
  // `replace` (not push) so each keystroke in the search box doesn't
  // pollute browser history. Filters still participate in back/forward
  // because each set is one entry relative to other pages.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (orgId) qs.set("orgId", orgId);
    const qsStr = qs.toString();
    router.replace(qsStr ? `/platform-users?${qsStr}` : "/platform-users");
  }, [search, orgId, router]);

  // Lazy-load the tenant list: only fetch when the picker is first opened OR
  // when a orgId is set via URL / external means. Saves ~1 HTTP call per
  // /platform-users visit for the common case (no tenant filter).
  const ensureTenantsLoaded = useCallback(() => {
    if (tenantsLoaded) return;
    setTenantsLoaded(true);
    fetch("/api/super/orgs?limit=1000")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setTenants(j.data.map((t: { id: string; name: string; slug: string; plan: string }) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            plan: t.plan,
          })));
        }
      })
      .catch(() => {});
  }, [tenantsLoaded]);

  // If the page was deep-linked with ?orgId=<id>, eagerly load the tenant
  // list so the picker can render the tenant's display name instead of an
  // opaque ID. Without this, the lazy-load path only triggers on picker click.
  useEffect(() => {
    if (orgId && !tenantsLoaded) ensureTenantsLoaded();
  }, [orgId, tenantsLoaded, ensureTenantsLoaded]);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Create panel
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    isSuperAdmin: false,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), limit: "20", search });
    if (orgId) qs.set("orgId", orgId);
    fetch(`/api/super/users?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setUsers(j.data);
          setTotalPages(j.pagination.totalPages);
          setTotal(j.pagination.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, orgId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, orgId]);

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
    if (selected.size === users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.id)));
    }
  }

  async function handleBulkGrantSuperAdmin() {
    if (!(await confirm({ title: `Grant Super Admin to ${selected.size} user(s)?`, description: "Each user will gain full platform-wide administrative access across every tenant.", confirmLabel: "Grant", tone: "danger" }))) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/super/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant_super_admin", ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Bulk operation failed");
      setSelected(new Set());
      fetchUsers();
    } catch {
      // silently fail
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkRevokeSuperAdmin() {
    if (!(await confirm({ title: `Revoke Super Admin from ${selected.size} user(s)?`, description: "Each user will lose platform-wide administrative access immediately.", confirmLabel: "Revoke", tone: "danger" }))) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/super/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_super_admin", ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Bulk operation failed");
      setSelected(new Set());
      fetchUsers();
    } catch {
      // silently fail
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/super/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to create user");
      setCreateOpen(false);
      setCreateForm({
        email: "",
        firstName: "",
        lastName: "",
        password: "",
        isSuperAdmin: false,
      });
      fetchUsers();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create user",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleSuperAdmin(user: UserInfo) {
    const isRevoke = user.isSuperAdmin;
    const fullName = `${user.firstName} ${user.lastName}`;
    if (
      !(await confirm({
        title: isRevoke ? `Revoke super admin from ${fullName}?` : `Grant super admin to ${fullName}?`,
        description: isRevoke
          ? "They will lose platform-wide administrative access immediately."
          : "They will gain full platform-wide administrative access across every tenant.",
        confirmLabel: isRevoke ? "Revoke" : "Grant",
        tone: "danger",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/super/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSuperAdmin: !user.isSuperAdmin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to update user");
      fetchUsers();
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
      <div className="px-4 pt-6 pb-5 md:px-10 md:pt-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900">Platform Users</h1>
          <p className="text-sm text-slate-500 mt-2">
            {total} users across all organizations
          </p>
        </div>
        <button
          onClick={() => {
            setCreateError("");
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Create User
        </button>
      </div>

      {/* Controls bar */}
      <div className="px-4 md:px-6 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="w-64" onClick={ensureTenantsLoaded} onFocus={ensureTenantsLoaded}>
          <TenantPicker
            tenants={tenants}
            value={orgId || null}
            onChange={(id) => setOrgId(id)}
            placeholder="All tenants"
          />
        </div>
        {orgId && (
          <button
            type="button"
            onClick={() => setOrgId("")}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Show all tenants
          </button>
        )}
      </div>

      {/* Table */}
      <div className="px-4 md:px-6 py-4">
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} message="No users found." />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={users.length > 0 && selected.size === users.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    User
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Email
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Orgs
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Role
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Last Sign In
                  </th>
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-gray-50/60 transition-colors group cursor-pointer"
                    onClick={() => router.push(`/platform-users/${u.id}`)}
                  >
                    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 text-[11px] font-medium">
                        {u.membershipCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isSuperAdmin ? (
                        <span className="bg-red-50 text-red-700 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          Super Admin
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.lastSignInAt
                        ? new Date(u.lastSignInAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            router.push(`/platform-users/${u.id}`)
                          }
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleSuperAdmin(u)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.isSuperAdmin
                              ? "text-gray-400 hover:text-red-600 hover:bg-red-50"
                              : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                          }`}
                          title={
                            u.isSuperAdmin
                              ? "Remove Super Admin"
                              : "Grant Super Admin"
                          }
                        >
                          <ShieldAlert className="h-4 w-4" />
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
          <button onClick={handleBulkGrantSuperAdmin} disabled={bulkLoading} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 rounded-lg">
            {bulkLoading ? "Processing..." : "Grant Super Admin"}
          </button>
          <button onClick={handleBulkRevokeSuperAdmin} disabled={bulkLoading} className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 rounded-lg">
            {bulkLoading ? "Processing..." : "Revoke Super Admin"}
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
        title="Create User"
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
              form="create-user-form"
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
          id="create-user-form"
          onSubmit={handleCreate}
          className="space-y-5"
        >
          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              required
              value={createForm.email}
              onChange={(e) =>
                setCreateForm({ ...createForm, email: e.target.value })
              }
              className={inputCls}
              placeholder="user@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name</label>
              <input
                type="text"
                required
                value={createForm.firstName}
                onChange={(e) =>
                  setCreateForm({ ...createForm, firstName: e.target.value })
                }
                className={inputCls}
                placeholder="John"
              />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input
                type="text"
                required
                value={createForm.lastName}
                onChange={(e) =>
                  setCreateForm({ ...createForm, lastName: e.target.value })
                }
                className={inputCls}
                placeholder="Doe"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Password</label>
            <input
              type="password"
              required
              value={createForm.password}
              onChange={(e) =>
                setCreateForm({ ...createForm, password: e.target.value })
              }
              className={inputCls}
              placeholder="Minimum 8 characters"
              minLength={8}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isSuperAdmin"
              checked={createForm.isSuperAdmin}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  isSuperAdmin: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="isSuperAdmin" className="text-sm text-gray-700">
              Super Admin
            </label>
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
