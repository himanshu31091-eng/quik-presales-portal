"use client";

import { useState, useEffect } from "react";
import {
  X, UserPlus, ChevronDown,
  MessageSquare, CheckSquare, TrendingUp, HardHat, UserCog, LayoutGrid,
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

interface MemberRow {
  id:     string;
  name:   string;
  email:  string;
  avatar: string | null;
  apps:   Array<{ slug: string; role: string }>;
  role:   string;
  status: "active" | "pending" | "inactive";
}

interface InviteModalProps {
  open:           boolean;
  onClose:        () => void;
  defaultAppSlug?: string;
  provisionedApps: ProvisionedApp[];
  onSuccess?:     (member: MemberRow) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultRoleName(roles: AppRoleOption[]): string {
  return roles.find((r) => r.isDefault)?.name ?? roles[0]?.name ?? "";
}

// ── Role select (reusable inside this modal) ──────────────────────────────────

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
      <div className={`animate-pulse rounded-lg bg-[var(--color-neutral-100)] ${compact ? "h-7 w-full" : "h-9 w-full"}`} />
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

type InviteMethod = "sso" | "native";

export default function InviteModal({
  open, onClose, defaultAppSlug, provisionedApps, onSuccess,
}: InviteModalProps) {
  const [name, setName]                   = useState("");
  const [email, setEmail]                 = useState("");
  // Mirrors the super-admin's first-Org-Admin invite flow: caller picks
  // SSO (Google/Microsoft auto sign-in) or Native (default password +
  // Set-Password screen on first login).
  const [inviteMethod, setInviteMethod]   = useState<InviteMethod>("sso");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(defaultAppSlug ? [defaultAppSlug] : []);
  const [rolePerApp, setRolePerApp]       = useState<Record<string, string>>({});
  const [rolesPerApp, setRolesPerApp]     = useState<Record<string, AppRoleOption[]>>({});
  const [loadingRoles, setLoadingRoles]   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setName("");
    setEmail("");
    setInviteMethod("sso");
    setError(null);
    setRolesPerApp({});
    setRolePerApp({});
    setLoadingRoles(true);

    const initialSlugs =
      defaultAppSlug && provisionedApps.some((a) => a.slug === defaultAppSlug)
        ? [defaultAppSlug]
        : provisionedApps.map((a) => a.slug);
    setSelectedSlugs(initialSlugs);

    // Fetch roles for all provisioned apps in parallel
    Promise.all(
      provisionedApps.map((app) =>
        fetch(`/api/roles?appSlug=${app.slug}`)
          .then((r) => r.json())
          .then((res) => ({ slug: app.slug, roles: (res.success ? res.data : []) as AppRoleOption[] }))
          .catch(() => ({ slug: app.slug, roles: [] as AppRoleOption[] }))
      )
    )
      .then((results) => {
        const map: Record<string, AppRoleOption[]> = {};
        results.forEach(({ slug, roles }) => { map[slug] = roles; });
        setRolesPerApp(map);

        // Initialise rolePerApp with the isDefault role for each selected app
        const defaults: Record<string, string> = {};
        initialSlugs.forEach((slug) => {
          defaults[slug] = getDefaultRoleName(map[slug] ?? []);
        });
        setRolePerApp(defaults);
      })
      .finally(() => setLoadingRoles(false));
  }, [open, defaultAppSlug, provisionedApps]);

  function toggleApp(slug: string) {
    setSelectedSlugs((prev) => {
      if (prev.includes(slug)) {
        if (prev.length === 1) return prev; // keep at least one
        setRolePerApp((r) => { const next = { ...r }; delete next[slug]; return next; });
        return prev.filter((s) => s !== slug);
      }
      const defaultRole = getDefaultRoleName(rolesPerApp[slug] ?? []);
      setRolePerApp((r) => ({ ...r, [slug]: defaultRole }));
      return [...prev, slug];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/members", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          inviteMethod,
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

  if (!open) return null;

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
              <UserPlus className="h-4 w-4 text-[var(--color-secondary)]" />
            </div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Invite Member</h2>
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

          {/* Name + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text" required
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:bg-[var(--color-bg-primary)] transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:bg-[var(--color-bg-primary)] transition-colors"
              />
            </div>
          </div>

          {/* Invitation method — same SSO/Native split the super-admin uses
              when inviting the first Org Admin. */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">
              Invitation Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["sso", "native"] as const).map((method) => {
                const active = inviteMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setInviteMethod(method)}
                    className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all ${
                      active
                        ? "border-[var(--color-secondary)] bg-[var(--color-secondary-light)]"
                        : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-secondary)]"
                    }`}
                  >
                    <span className={`text-sm font-medium ${active ? "text-[var(--color-secondary)]" : "text-[var(--color-text-primary)]"}`}>
                      {method === "sso" ? "SSO (Google / Microsoft)" : "Native (Email + Password)"}
                    </span>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {method === "sso"
                        ? "User signs in via their existing provider."
                        : "User receives a temp password and is forced to change it on first login."}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* App selection */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Grant Access To</label>
              <span className="text-xs text-[var(--color-text-tertiary)]">optional · multi-select</span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] -mt-1">
              Access to one app grants login to the platform — you can enable additional apps below.
            </p>
            <div className="flex flex-wrap gap-2 mt-0.5">
              {provisionedApps.map((app) => {
                const meta   = APP_META[app.slug];
                const Icon   = meta?.icon ?? LayoutGrid;
                const active = selectedSlugs.includes(app.slug);
                return (
                  <button
                    key={app.slug} type="button" onClick={() => toggleApp(app.slug)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? "border-[var(--color-secondary)] bg-[var(--color-secondary-light)] text-[var(--color-secondary)]"
                        : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-[var(--color-secondary)]" : meta?.color ?? "text-[var(--color-text-secondary)]"}`} />
                    {app.name}
                    {active && (
                      <span className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-secondary)] text-white text-[10px] font-bold">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                {singleApp && singleAppData ? `Role in ${singleAppData.name}` : "Roles per Application"}
              </label>
              {loadingRoles && (
                <span className="text-xs text-[var(--color-text-tertiary)]">Loading roles…</span>
              )}
            </div>

            {singleApp ? (
              <RoleSelect
                slug={selectedSlugs[0]}
                value={rolePerApp[selectedSlugs[0]] ?? ""}
                onChange={(v) => setRolePerApp((p) => ({ ...p, [selectedSlugs[0]]: v }))}
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
                      <div className="w-40">
                        <RoleSelect
                          slug={slug} compact
                          value={rolePerApp[slug] ?? ""}
                          onChange={(v) => setRolePerApp((p) => ({ ...p, [slug]: v }))}
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

          {/* Error */}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] pt-4 -mx-6 px-6">
            <button
              type="button" onClick={onClose} disabled={loading}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending…
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Send Invite
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
