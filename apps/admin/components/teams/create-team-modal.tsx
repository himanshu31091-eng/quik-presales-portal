"use client";

import { useState, useEffect, useRef } from "react";
import {
  X, Users, ChevronDown, Search, LayoutGrid,
  MessageSquare, CheckSquare, TrendingUp, HardHat, UserCog,
} from "lucide-react";

const APP_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  quiksocial:      { icon: MessageSquare, color: "text-blue-500",   bg: "bg-blue-50" },
  quiktrack:       { icon: CheckSquare,   color: "text-green-500",  bg: "bg-green-50" },
  quikscale:       { icon: TrendingUp,    color: "text-purple-500", bg: "bg-purple-50" },
  constructionerp: { icon: HardHat,       color: "text-amber-500",  bg: "bg-amber-50" },
  hrms:            { icon: UserCog,       color: "text-rose-500",   bg: "bg-rose-50" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppRoleOption {
  id:        string;
  name:      string;
  isDefault: boolean;
  isSystem:  boolean;
}

interface ProvisionedApp { id: string; name: string; slug: string }

interface ExistingMember {
  id:    string;
  name:  string;
  email: string;
  apps:  Array<{ slug: string; role: string }>;
}

export interface TeamRow {
  id:          string;
  name:        string;
  slug:        string;
  color:       string;
  memberCount: number;
  members:     Array<{ name: string }>;
  apps:        Array<{ slug: string; name: string }>;
  createdAt:   string;
}

interface CreateTeamModalProps {
  open:      boolean;
  onClose:   () => void;
  onSuccess: (team: TeamRow) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultRoleName(roles: AppRoleOption[]): string {
  return roles.find((r) => r.isDefault)?.name ?? roles[0]?.name ?? "";
}

// ── Role select for team table ────────────────────────────────────────────────

function RoleSelect({
  value, onChange, roles, loading,
}: {
  value:    string;
  onChange: (v: string) => void;
  roles:    AppRoleOption[];
  loading:  boolean;
}) {
  if (loading) {
    return <div className="h-7 w-full animate-pulse rounded-lg bg-[var(--color-neutral-100)]" />;
  }
  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1.5 pr-6 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
      >
        {systemRoles.length > 0 && (
          <optgroup label="System Roles">
            {systemRoles.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}{r.isDefault ? " · Default" : ""}
              </option>
            ))}
          </optgroup>
        )}
        {customRoles.length > 0 && (
          <optgroup label="Custom Roles">
            {customRoles.map((r) => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </optgroup>
        )}
        {roles.length === 0 && <option value="">—</option>}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CreateTeamModal({ open, onClose, onSuccess }: CreateTeamModalProps) {
  const [teamName, setTeamName]               = useState("");
  const [provisionedApps, setProvisionedApps] = useState<ProvisionedApp[]>([]);
  const [selectedApps, setSelectedApps]       = useState<string[]>([]);
  const [allMembers, setAllMembers]           = useState<ExistingMember[]>([]);
  const [rolesPerApp, setRolesPerApp]         = useState<Record<string, AppRoleOption[]>>({});
  const [loadingApps, setLoadingApps]         = useState(false);
  const [loadingMembers, setLoadingMembers]   = useState(false);
  const [loadingRoles, setLoadingRoles]       = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  const [selectedIds, setSelectedIds]       = useState<string[]>([]);
  const [memberRoles, setMemberRoles]       = useState<Record<string, Record<string, string>>>({});
  const [memberDropOpen, setMemberDropOpen] = useState(false);
  const [memberSearch, setMemberSearch]     = useState("");
  const memberDropRef                       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTeamName("");
    setSelectedIds([]);
    setMemberRoles({});
    setMemberSearch("");
    setMemberDropOpen(false);
    setError(null);
    setRolesPerApp({});
    setLoadingApps(true);
    setLoadingMembers(true);
    setLoadingRoles(true);

    const controller = new AbortController();
    const { signal } = controller;

    // Fetch provisioned apps first, then load roles for each
    fetch("/api/apps/provisioned", { signal })
      .then((r) => r.json())
      .then((res) => {
        const apps: ProvisionedApp[] = res.success ? res.data : [];
        setProvisionedApps(apps);
        setSelectedApps(apps.map((a) => a.slug));

        // Fetch roles for every app in parallel
        return Promise.all(
          apps.map((app) =>
            fetch(`/api/roles?appSlug=${app.slug}`, { signal })
              .then((r) => r.json())
              .then((r) => ({ slug: app.slug, roles: (r.success ? r.data : []) as AppRoleOption[] }))
              .catch(() => ({ slug: app.slug, roles: [] as AppRoleOption[] }))
          )
        );
      })
      .then((results) => {
        const map: Record<string, AppRoleOption[]> = {};
        results.forEach(({ slug, roles }) => { map[slug] = roles; });
        setRolesPerApp(map);
      })
      .catch((err: unknown) => { if (err instanceof Error && err.name !== "AbortError") console.error(err); })
      .finally(() => { setLoadingApps(false); setLoadingRoles(false); });

    fetch("/api/members", { signal })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setAllMembers(
            (res.data as Array<{ id: string; name: string; email: string; status: string; apps: Array<{ slug: string; role: string }> }>)
              .filter((m) => m.status !== "inactive")
          );
        }
      })
      .catch((err: unknown) => { if (err instanceof Error && err.name !== "AbortError") console.error(err); })
      .finally(() => setLoadingMembers(false));

    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (memberDropRef.current && !memberDropRef.current.contains(e.target as Node)) {
        setMemberDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleApp(slug: string) {
    setSelectedApps((prev) =>
      prev.includes(slug)
        ? prev.length > 1 ? prev.filter((s) => s !== slug) : prev
        : [...prev, slug]
    );
  }

  const eligibleMembers = allMembers.filter((m) =>
    m.apps.some((a) => selectedApps.includes(a.slug))
  );
  const searchedMembers = eligibleMembers.filter((m) => {
    const q = memberSearch.toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        setMemberRoles((r) => { const next = { ...r }; delete next[id]; return next; });
        return prev.filter((x) => x !== id);
      }
      const member = allMembers.find((m) => m.id === id);
      const defaults: Record<string, string> = {};
      selectedApps.forEach((slug) => {
        // Use existing role if available, else fall back to the app's default role
        defaults[slug] = member?.apps.find((a) => a.slug === slug)?.role
          ?? getDefaultRoleName(rolesPerApp[slug] ?? []);
      });
      setMemberRoles((r) => ({ ...r, [id]: defaults }));
      return [...prev, id];
    });
  }

  function updateRole(memberId: string, appSlug: string, role: string) {
    setMemberRoles((prev) => ({ ...prev, [memberId]: { ...prev[memberId], [appSlug]: role } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/teams", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     teamName,
          appSlugs: selectedApps,
          members:  selectedIds.map((id) => ({ membershipId: id, roles: memberRoles[id] ?? {} })),
        }),
      });
      const json = await res.json();
      if (json.success) { onSuccess(json.data as TeamRow); onClose(); }
      else setError(json.error ?? "Failed to create team");
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const visibleApps     = provisionedApps.filter((a) => selectedApps.includes(a.slug));
  const selectedMembers = allMembers.filter((m) => selectedIds.includes(m.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl mx-4">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-secondary-light)]">
              <Users className="h-4 w-4 text-[var(--color-secondary)]" />
            </div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Create Team</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

          {/* Team Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">
              Team Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text" required
              value={teamName} onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Engineering, Sales, HR"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:bg-[var(--color-bg-primary)] transition-colors"
            />
          </div>

          {/* App Access chips */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">App Access</label>
              <span className="text-xs text-[var(--color-text-tertiary)]">Select which apps this team can access</span>
            </div>
            {loadingApps ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 w-24 rounded-full bg-[var(--color-neutral-100)] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {provisionedApps.map(({ slug, name }) => {
                  const meta   = APP_META[slug];
                  const Icon   = meta?.icon ?? LayoutGrid;
                  const active = selectedApps.includes(slug);
                  return (
                    <button
                      key={slug} type="button" onClick={() => toggleApp(slug)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        active
                          ? "border-[var(--color-secondary)] bg-[var(--color-secondary-light)] text-[var(--color-secondary)]"
                          : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)]"
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${active ? "text-[var(--color-secondary)]" : meta?.color}`} />
                      {name}
                      {active && (
                        <span className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-secondary)] text-white text-[10px] font-bold">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Members multiselect */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Members</label>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {selectedIds.length > 0
                  ? `${selectedIds.length} member${selectedIds.length !== 1 ? "s" : ""} selected`
                  : "Add existing members to this team"}
              </span>
            </div>

            <div ref={memberDropRef} className="relative">
              <button
                type="button"
                onClick={() => setMemberDropOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5 text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0" />
                  {selectedIds.length === 0
                    ? "Select members…"
                    : `${selectedIds.length} member${selectedIds.length !== 1 ? "s" : ""} selected`}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${memberDropOpen ? "rotate-180" : ""}`} />
              </button>

              {memberDropOpen && (
                <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-xl">
                  <div className="border-b border-[var(--color-border)] px-3 py-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                      <input
                        type="text" value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search members…" autoFocus
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-1.5 pl-8 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto py-1">
                    {loadingMembers ? (
                      <div className="px-3 py-3 text-sm text-[var(--color-text-tertiary)]">Loading members…</div>
                    ) : searchedMembers.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-[var(--color-text-tertiary)]">
                        {eligibleMembers.length === 0
                          ? "No members have access to the selected apps"
                          : "No members match your search"}
                      </div>
                    ) : (
                      searchedMembers.map((member) => {
                        const checked  = selectedIds.includes(member.id);
                        const initials = member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                        return (
                          <button
                            key={member.id} type="button" onClick={() => toggleMember(member.id)}
                            className="flex w-full items-center gap-3 px-3 py-2 hover:bg-[var(--color-bg-secondary)] transition-colors"
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${checked ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]" : "border-[var(--color-border)]"}`}>
                              {checked && (
                                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-light)] text-xs font-semibold text-[var(--color-secondary)]">
                              {initials}
                            </span>
                            <span className="flex flex-col items-start min-w-0">
                              <span className="text-sm font-medium text-[var(--color-text-primary)] truncate max-w-[220px]">{member.name}</span>
                              <span className="text-xs text-[var(--color-text-tertiary)] truncate max-w-[220px]">{member.email}</span>
                            </span>
                            <span className="ml-auto flex gap-1 shrink-0">
                              {member.apps.filter((a) => selectedApps.includes(a.slug)).slice(0, 3).map((a) => {
                                const meta = APP_META[a.slug];
                                const Icon = meta?.icon ?? LayoutGrid;
                                return (
                                  <span key={a.slug} title={a.slug} className={`flex h-5 w-5 items-center justify-center rounded-full ${meta?.bg ?? "bg-[var(--color-neutral-100)]"}`}>
                                    <Icon className={`h-3 w-3 ${meta?.color ?? "text-[var(--color-text-tertiary)]"}`} />
                                  </span>
                                );
                              })}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  {selectedIds.length > 0 && (
                    <div className="border-t border-[var(--color-border)] px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-[var(--color-text-tertiary)]">{selectedIds.length} selected</span>
                      <button
                        type="button" onClick={() => setMemberDropOpen(false)}
                        className="rounded-lg bg-[var(--color-secondary)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Role assignment table */}
            {selectedMembers.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <div className="min-w-max">
                  <div
                    className="grid items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]"
                    style={{ gridTemplateColumns: `220px ${visibleApps.map(() => "130px").join(" ")} 32px` }}
                  >
                    <span>Member</span>
                    {visibleApps.map((a) => {
                      const meta = APP_META[a.slug];
                      const Icon = meta?.icon ?? LayoutGrid;
                      return (
                        <span key={a.slug} className="flex items-center gap-1.5 overflow-hidden" title={a.name}>
                          <Icon className={`h-3 w-3 shrink-0 ${meta?.color}`} />
                          <span className="truncate">{a.name}</span>
                        </span>
                      );
                    })}
                    <span />
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {selectedMembers.map((member) => {
                      const initials = member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                      return (
                        <div
                          key={member.id}
                          className="grid items-center gap-3 px-4 py-3"
                          style={{ gridTemplateColumns: `220px ${visibleApps.map(() => "130px").join(" ")} 32px` }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-light)] text-xs font-semibold text-[var(--color-secondary)]">
                              {initials}
                            </span>
                            <span className="flex flex-col min-w-0">
                              <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{member.name}</span>
                              <span className="text-xs text-[var(--color-text-tertiary)] truncate">{member.email}</span>
                            </span>
                          </div>
                          {visibleApps.map((app) => (
                            <RoleSelect
                              key={app.slug}
                              value={memberRoles[member.id]?.[app.slug] ?? getDefaultRoleName(rolesPerApp[app.slug] ?? [])}
                              onChange={(v) => updateRole(member.id, app.slug, v)}
                              roles={rolesPerApp[app.slug] ?? []}
                              loading={loadingRoles}
                            />
                          ))}
                          <button
                            type="button" onClick={() => toggleMember(member.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4 -mx-6 px-6">
            {error ? <p className="text-sm text-red-500">{error}</p> : <span />}
            <div className="flex items-center gap-3">
              <button
                type="button" onClick={onClose} disabled={submitting}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit" disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors disabled:opacity-60"
              >
                {submitting
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : <Users className="h-4 w-4" />}
                {submitting ? "Creating…" : "Create Team"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
