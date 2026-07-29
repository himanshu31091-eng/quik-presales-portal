"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UserPlus, Users, Search, Trash2,
  MessageSquare, CheckSquare, TrendingUp, HardHat, UserCog, LayoutGrid,
  Pencil, AlertTriangle, MailX, ChevronDown, X,
} from "lucide-react";
import InviteModal from "@/components/members/invite-modal";
import EditMemberModal from "@/components/members/edit-member-modal";

const APP_META: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  quiksocial:      { icon: MessageSquare, color: "text-blue-500",   bg: "bg-blue-50",   label: "QuikSocial" },
  quiktrack:       { icon: CheckSquare,   color: "text-green-500",  bg: "bg-green-50",  label: "QuikTrack" },
  quikscale:       { icon: TrendingUp,    color: "text-purple-500", bg: "bg-purple-50", label: "QuikScale" },
  constructionerp: { icon: HardHat,       color: "text-amber-500",  bg: "bg-amber-50",  label: "ConstructionERP" },
  hrms:            { icon: UserCog,       color: "text-rose-500",   bg: "bg-rose-50",   label: "HRMS" },
};

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-50 text-green-700 border-green-200",
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  inactive: "bg-[var(--color-neutral-100)] text-[var(--color-text-tertiary)] border-[var(--color-border)]",
};

interface ProvisionedApp { id: string; name: string; slug: string }

interface MemberRow {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  apps: Array<{ slug: string; role: string }>;
  role: string;
  status: "active" | "pending" | "inactive";
}

export default function MembersPage() {
  const [provisionedApps, setProvisionedApps] = useState<ProvisionedApp[]>([]);
  const [members, setMembers]                 = useState<MemberRow[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [inviteOpen, setInviteOpen]           = useState(false);
  const [editTarget, setEditTarget]           = useState<MemberRow | null>(null);
  const [search, setSearch]                   = useState("");
  const [appFilters, setAppFilters]           = useState<string[]>([]);
  const [appDropOpen, setAppDropOpen]         = useState(false);
  const appDropRef                            = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter]       = useState("");
  const [statusDropOpen, setStatusDropOpen]   = useState(false);
  const statusDropRef                         = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget]       = useState<MemberRow | null>(null);
  const [togglingId, setTogglingId]           = useState<string | null>(null);

  const loadMembers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res  = await fetch("/api/members", { signal });
      const json = await res.json();
      if (json.success) setMembers(json.data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    fetch("/api/apps/provisioned", { signal })
      .then((r) => r.json())
      .then((res) => { if (res.success) setProvisionedApps(res.data); })
      .catch((err: unknown) => { if (err instanceof Error && err.name !== "AbortError") console.error(err); });

    loadMembers(signal);

    return () => controller.abort();
  }, [loadMembers]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (appDropRef.current && !appDropRef.current.contains(e.target as Node)) {
        setAppDropOpen(false);
      }
      if (statusDropRef.current && !statusDropRef.current.contains(e.target as Node)) {
        setStatusDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleAppFilter(slug: string) {
    setAppFilters((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  function handleInvited(member: MemberRow) {
    setMembers((prev) => [member, ...prev]);
  }

  function handleUpdated(updated: MemberRow) {
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  async function toggleStatus(member: MemberRow) {
    if (togglingId === member.id) return;
    // pending members can only be deactivated, not activated
    const newStatus = member.status === "active" ? "inactive" : "active";
    setTogglingId(member.id);
    try {
      const res  = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, status: newStatus } : m))
        );
      }
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;

    // Optimistic: close modal and remove from list immediately
    setDeleteTarget(null);
    setMembers((prev) => prev.filter((m) => m.id !== target.id));

    try {
      const res  = await fetch(`/api/members/${target.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) {
        // Revert if API failed
        setMembers((prev) => [target, ...prev]);
      }
    } catch {
      setMembers((prev) => [target, ...prev]);
    }
  }

  const filtered = members.filter((m) => {
    const q           = search.toLowerCase();
    const matchSearch = !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    const matchApp    = appFilters.length === 0 || m.apps.some((a) => appFilters.includes(a.slug));
    const matchStatus = !statusFilter || m.status === statusFilter;
    return matchSearch && matchApp && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Members</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Manage member access across all QuikIT applications
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Invite Member
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
        </div>
        {/* App multiselect */}
        <div ref={appDropRef} className="relative">
          <button
            type="button"
            onClick={() => setAppDropOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] transition-colors"
          >
            <span>
              {appFilters.length === 0
                ? "All Applications"
                : appFilters.length === 1
                  ? (provisionedApps.find((a) => a.slug === appFilters[0])?.name ?? appFilters[0])
                  : `${appFilters.length} apps`}
            </span>
            {appFilters.length > 0 && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); setAppFilters([]); }}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-neutral-200)] hover:bg-[var(--color-secondary)] hover:text-white transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${appDropOpen ? "rotate-180" : ""}`} />
          </button>

          {appDropOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-xl">
              <button
                type="button"
                onClick={() => { setAppFilters([]); setAppDropOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${appFilters.length === 0 ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]" : "border-[var(--color-border)]"}`}>
                  {appFilters.length === 0 && <span className="h-2 w-2 rounded-sm bg-white" />}
                </span>
                All Applications
              </button>
              <div className="my-1 border-t border-[var(--color-border)]" />
              {provisionedApps.map((app) => {
                const checked = appFilters.includes(app.slug);
                return (
                  <button
                    key={app.slug}
                    type="button"
                    onClick={() => toggleAppFilter(app.slug)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${checked ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]" : "border-[var(--color-border)]"}`}>
                      {checked && (
                        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {app.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* Status dropdown */}
        <div ref={statusDropRef} className="relative">
          <button
            type="button"
            onClick={() => setStatusDropOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] transition-colors"
          >
            <span>
              {statusFilter === ""         ? "All Statuses" :
               statusFilter === "active"   ? "Active" :
               statusFilter === "pending"  ? "Pending" :
                                             "Inactive"}
            </span>
            {statusFilter !== "" && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); setStatusFilter(""); }}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-neutral-200)] hover:bg-[var(--color-secondary)] hover:text-white transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${statusDropOpen ? "rotate-180" : ""}`} />
          </button>

          {statusDropOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[150px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-xl">
              {(["", "active", "pending", "inactive"] as const).map((val) => {
                const label = val === "" ? "All Statuses" : val === "pending" ? "Pending" : val.charAt(0).toUpperCase() + val.slice(1);
                const selected = statusFilter === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setStatusFilter(val); setStatusDropOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${selected ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]" : "border-[var(--color-border)]"}`}>
                      {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">All Members</span>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {filtered.length} member{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="py-3 pl-5 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Member</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">App Access</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Status</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Active</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-3 pl-5 pr-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-[var(--color-neutral-100)] animate-pulse" />
                      <div className="space-y-1.5">
                        <div className="h-3 w-28 rounded bg-[var(--color-neutral-100)] animate-pulse" />
                        <div className="h-2.5 w-36 rounded bg-[var(--color-neutral-100)] animate-pulse" />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><div className="h-5 w-32 rounded-full bg-[var(--color-neutral-100)] animate-pulse" /></td>
                  <td className="px-3 py-3"><div className="h-5 w-20 rounded-full bg-[var(--color-neutral-100)] animate-pulse" /></td>
                  <td className="px-3 py-3"><div className="h-5 w-10 rounded-full bg-[var(--color-neutral-100)] animate-pulse" /></td>
                  <td className="px-3 py-3"><div className="h-5 w-14 rounded bg-[var(--color-neutral-100)] animate-pulse" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
                      <Users className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {search || appFilters.length || statusFilter ? "No members match your filters" : "No members yet"}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                        {search || appFilters.length || statusFilter
                          ? "Try adjusting your search or filters"
                          : "Invite your first member to get started"}
                      </p>
                    </div>
                    {!search && !appFilters.length && !statusFilter && (
                      <button
                        onClick={() => setInviteOpen(true)}
                        className="mt-1 flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
                      >
                        <UserPlus className="h-4 w-4" />
                        Invite Member
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((member) => {
                const isAdmin    = member.role === "admin" || member.role === "super_admin";
                const isActive   = member.status === "active";
                const isPending  = member.status === "pending";
                const isToggling = togglingId === member.id;

                // Admins implicitly have access to all provisioned apps
                const displayApps = isAdmin
                  ? provisionedApps.map((a) => ({ slug: a.slug, role: "admin" }))
                  : member.apps;

                return (
                  <tr key={member.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors">

                    {/* Member */}
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-light)] text-sm font-semibold text-[var(--color-secondary)]">
                          {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">
                            {member.name}
                            {isAdmin && (
                              <span className="ml-2 rounded-full bg-[var(--color-secondary-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-secondary)]">
                                Admin
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{member.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* App Access */}
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {displayApps.length === 0 ? (
                          <span className="text-xs text-[var(--color-text-tertiary)]">No apps</span>
                        ) : displayApps.map(({ slug, role }) => {
                          const meta = APP_META[slug];
                          const Icon = meta?.icon ?? LayoutGrid;
                          return (
                            <span
                              key={slug}
                              title={`${meta?.label ?? slug} — ${role}`}
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta?.bg ?? "bg-[var(--color-neutral-100)]"} ${meta?.color ?? "text-[var(--color-text-secondary)]"}`}
                            >
                              <Icon className="h-3 w-3" />
                              {meta?.label ?? slug}
                              <span className="opacity-60 font-normal">· {role}</span>
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[member.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          isActive   ? "bg-green-500" :
                          isPending  ? "bg-amber-400" :
                          "bg-[var(--color-neutral-200)]"
                        }`} />
                        {isPending ? "Invite Sent" : member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                      </span>
                    </td>

                    {/* Active toggle */}
                    <td className="px-3 py-3">
                      <button
                        onClick={() => !isPending && !isAdmin && toggleStatus(member)}
                        disabled={isPending || isAdmin || isToggling}
                        title={isAdmin ? "Org admin cannot be deactivated" : isPending ? "Cannot toggle — invite pending" : isActive ? "Deactivate member" : "Activate member"}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                          isActive ? "bg-[var(--color-secondary)]" : "bg-[var(--color-neutral-200)]"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          isActive ? "translate-x-6" : "translate-x-1"
                        } ${isToggling ? "opacity-60" : ""}`} />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          title="Edit member"
                          onClick={() => setEditTarget(member)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-secondary)] transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {!isAdmin && (
                          <button
                            title="Remove member"
                            onClick={() => setDeleteTarget(member)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        provisionedApps={provisionedApps}
        onSuccess={handleInvited}
      />

      <EditMemberModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        member={editTarget}
        provisionedApps={provisionedApps}
        onSuccess={handleUpdated}
      />

      {/* Delete / Revoke confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-2xl">
            {deleteTarget.status === "pending" ? (
              /* Revoke invitation dialog */
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
                  <MailX className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Revoke Invitation?</h3>
                  <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                    The invitation sent to <strong className="text-[var(--color-text-primary)]">{deleteTarget.email}</strong> will be revoked.
                    Their invite link will expire immediately and they will no longer be able to join your organisation.
                  </p>
                </div>
              </div>
            ) : (
              /* Remove active member dialog */
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Remove member?</h3>
                  <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                    <strong className="text-[var(--color-text-primary)]">{deleteTarget.name}</strong> will be permanently removed from your organisation and lose access to all applications. This cannot be undone.
                  </p>
                </div>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  deleteTarget.status === "pending"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {deleteTarget.status === "pending" ? (
                  <MailX className="h-4 w-4" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleteTarget.status === "pending" ? "Revoke Invitation" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
