"use client";

import { useState, useEffect } from "react";
import {
  X, UserCog, ChevronDown,
  MessageSquare, CheckSquare, TrendingUp, HardHat, UserCog as HrmsIcon, LayoutGrid,
} from "lucide-react";

const APP_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  quiksocial:      { icon: MessageSquare, color: "text-blue-500",   bg: "bg-blue-50" },
  quiktrack:       { icon: CheckSquare,   color: "text-green-500",  bg: "bg-green-50" },
  quikscale:       { icon: TrendingUp,    color: "text-purple-500", bg: "bg-purple-50" },
  constructionerp: { icon: HardHat,       color: "text-amber-500",  bg: "bg-amber-50" },
  hrms:            { icon: HrmsIcon,      color: "text-rose-500",   bg: "bg-rose-50" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppRoleOption {
  id:        string;
  name:      string;
  isDefault: boolean;
  isSystem:  boolean;
}

interface ProvisionedApp { id: string; name: string; slug: string }

interface MemberRow {
  id:     string;
  name:   string;
  email:  string;
  avatar: string | null;
  apps:   Array<{ slug: string; role: string }>;
  role:   string;
  status: "active" | "pending" | "inactive";
}

interface EditMemberModalProps {
  open:            boolean;
  onClose:         () => void;
  member:          MemberRow | null;
  provisionedApps: ProvisionedApp[];
  onSuccess?:      (updated: MemberRow) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultRoleName(roles: AppRoleOption[]): string {
  return roles.find((r) => r.isDefault)?.name ?? roles[0]?.name ?? "";
}

// ── Role select (reusable) ────────────────────────────────────────────────────

function RoleSelect({
  slug, compact = false, value, onChange, roles, loading,
}: {
  slug:     string;
  compact?: boolean;
  value:    string;
  onChange: (v: string) => void;
  roles:    AppRoleOption[];
  loading:  boolean;
}) {
  if (loading) {
    return (
      <div
        className={`animate-pulse rounded-lg bg-[var(--color-neutral-100)] ${
          compact ? "h-7 w-full" : "h-9 w-full"
        }`}
      />
    );
  }

  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] transition-colors ${
          compact ? "px-2.5 py-1.5 pr-6 text-xs" : "px-3 py-2 pr-8 text-sm"
        }`}
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
        {roles.length === 0 && (
          <option value="">No roles available</option>
        )}
      </select>
      <ChevronDown
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] ${
          compact ? "right-1.5 h-3 w-3" : "right-2.5 h-4 w-4"
        }`}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EditMemberModal({
  open, onClose, member, provisionedApps, onSuccess,
}: EditMemberModalProps) {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [rolePerApp, setRolePerApp]       = useState<Record<string, string>>({});
  const [rolesPerApp, setRolesPerApp]     = useState<Record<string, AppRoleOption[]>>({});
  const [loadingRoles, setLoadingRoles]   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // On open: pre-populate from member data and fetch real AppRoles for all apps
  useEffect(() => {
    if (!open || !member) return;

    setError(null);

    const slugs = member.apps.map((a) => a.slug);
    setSelectedSlugs(slugs);

    // Pre-populate with the real role names already on the member
    const preRoles: Record<string, string> = {};
    member.apps.forEach((a) => { preRoles[a.slug] = a.role; });
    setRolePerApp(preRoles);

    // Fetch live AppRoles for all provisioned apps
    setLoadingRoles(true);
    Promise.all(
      provisionedApps.map((app) =>
        fetch(`/api/roles?appSlug=${app.slug}`)
          .then((r) => r.json())
          .then((res) => ({ slug: app.slug, roles: (res.success ? res.data : []) as AppRoleOption[] }))
          .catch(() => ({ slug: app.slug, roles: [] as AppRoleOption[] }))
      )
    ).then((results) => {
      const map: Record<string, AppRoleOption[]> = {};
      results.forEach(({ slug, roles }) => { map[slug] = roles; });
      setRolesPerApp(map);

      // If a member's role isn't in the fetched list, fall back to default
      setRolePerApp((prev) => {
        const next = { ...prev };
        slugs.forEach((slug) => {
          const appRoles = map[slug] ?? [];
          const names = appRoles.map((r) => r.name.toLowerCase());
          if (!names.includes((next[slug] ?? "").toLowerCase())) {
            next[slug] = getDefaultRoleName(appRoles);
          }
        });
        return next;
      });
    }).finally(() => setLoadingRoles(false));
  }, [open, member]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleApp(slug: string) {
    setSelectedSlugs((prev) => {
      if (prev.includes(slug)) {
        setRolePerApp((r) => { const next = { ...r }; delete next[slug]; return next; });
        return prev.filter((s) => s !== slug);
      }
      // When selecting a new app, default to its isDefault role
      const defaultRole = getDefaultRoleName(rolesPerApp[slug] ?? []);
      setRolePerApp((r) => ({ ...r, [slug]: defaultRole }));
      return [...prev, slug];
    });
  }

  function setRole(slug: string, role: string) {
    setRolePerApp((prev) => ({ ...prev, [slug]: role }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appAccess: selectedSlugs.map((slug) => ({
            appSlug: slug,
            role:    rolePerApp[slug] ?? getDefaultRoleName(rolesPerApp[slug] ?? []),
          })),
        }),
      });

      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Something went wrong"); return; }

      onSuccess?.(json.data);
      onClose();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !member) return null;

  const singleApp     = selectedSlugs.length === 1;
  const singleAppData = singleApp ? provisionedApps.find((a) => a.slug === selectedSlugs[0]) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-secondary-light)]">
              <UserCog className="h-4 w-4 text-[var(--color-secondary)]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Edit Member</h2>
              <p className="text-xs text-[var(--color-text-tertiary)]">{member.name} · {member.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">

          {/* App selection */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">App Access</label>
              <span className="text-xs text-[var(--color-text-tertiary)]">multi-select</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {provisionedApps.map((app) => {
                const meta   = APP_META[app.slug];
                const Icon   = meta?.icon ?? LayoutGrid;
                const color  = meta?.color ?? "text-[var(--color-text-secondary)]";
                const active = selectedSlugs.includes(app.slug);
                return (
                  <button
                    key={app.slug}
                    type="button"
                    onClick={() => toggleApp(app.slug)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? "border-[var(--color-secondary)] bg-[var(--color-secondary-light)] text-[var(--color-secondary)]"
                        : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-[var(--color-secondary)]" : color}`} />
                    {app.name}
                    {active && (
                      <span className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-secondary)] text-white text-[10px] font-bold">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role selectors — one per selected app */}
          {selectedSlugs.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                {singleApp && singleAppData ? `Role in ${singleAppData.name}` : "Roles per Application"}
              </label>

              {singleApp ? (
                <RoleSelect
                  slug={selectedSlugs[0]}
                  value={rolePerApp[selectedSlugs[0]] ?? ""}
                  onChange={(v) => setRole(selectedSlugs[0], v)}
                  roles={rolesPerApp[selectedSlugs[0]] ?? []}
                  loading={loadingRoles}
                />
              ) : (
                <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                  {selectedSlugs.map((slug) => {
                    const app  = provisionedApps.find((a) => a.slug === slug);
                    if (!app) return null;
                    const meta = APP_META[slug];
                    const Icon = meta?.icon ?? LayoutGrid;
                    return (
                      <div key={slug} className="flex items-center gap-3">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta?.bg ?? "bg-[var(--color-neutral-100)]"}`}>
                          <Icon className={`h-3.5 w-3.5 ${meta?.color ?? "text-[var(--color-text-secondary)]"}`} />
                        </div>
                        <span className="flex-1 text-sm font-medium text-[var(--color-text-primary)]">{app.name}</span>
                        <div className="w-36">
                          <RoleSelect
                            slug={slug}
                            compact
                            value={rolePerApp[slug] ?? ""}
                            onChange={(v) => setRole(slug, v)}
                            roles={rolesPerApp[slug] ?? []}
                            loading={loadingRoles}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* No apps selected notice */}
          {selectedSlugs.length === 0 && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700">
              Saving with no apps selected will remove all application access for this member.
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 border border-red-200">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] pt-4 -mx-6 px-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving…
                </span>
              ) : (
                <>
                  <UserCog className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
