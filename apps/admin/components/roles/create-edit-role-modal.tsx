"use client";

import { useState, useEffect } from "react";
import { X, Shield, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Permission {
  id:       string;
  resource: string;
  action:   string;
  label:    string;
}

interface RemoteModule {
  key:         string;
  label:       string;
  description: string;
  permissions: { resource: string; action: string; label: string }[];
}

interface RoleDetail {
  id:          string;
  name:        string;
  description: string | null;
  isSystem:    boolean;
  permissions: Permission[];
}

interface Props {
  open:      boolean;
  appSlug:   string;
  appName:   string;
  editRole:  RoleDetail | null;
  onClose:   () => void;
  onSuccess: (role: {
    id: string; name: string; description: string | null;
    isSystem: boolean; isDefault: boolean;
    permissionCount: number; userCount: number; createdAt: string;
  }) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_ORDER: Record<string, number> = {
  read: 0, write: 1, delete: 2, approve: 3, admin: 4,
};

const ACTION_LABELS: Record<string, string> = {
  read: "Read", write: "Write", delete: "Delete", approve: "Approve", admin: "Admin",
};

const ACTION_COLORS: Record<string, string> = {
  read:    "text-blue-600   bg-blue-50   border-blue-200",
  write:   "text-green-600  bg-green-50  border-green-200",
  delete:  "text-red-600    bg-red-50    border-red-200",
  approve: "text-amber-600  bg-amber-50  border-amber-200",
  admin:   "text-purple-600 bg-purple-50 border-purple-200",
};

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({
  checked, indeterminate = false, onChange, disabled = false,
}: {
  checked: boolean; indeterminate?: boolean; onChange: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button" onClick={disabled ? undefined : onChange} disabled={disabled}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]"
          : indeterminate
          ? "border-[var(--color-secondary)] bg-[var(--color-secondary-light)]"
          : "border-[var(--color-border)] hover:border-[var(--color-secondary)]"
      }`}
    >
      {checked && (
        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {indeterminate && !checked && (
        <span className="h-1.5 w-1.5 rounded-sm bg-[var(--color-secondary)]" />
      )}
    </button>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function CreateEditRoleModal({ open, appSlug, appName, editRole, onClose, onSuccess }: Props) {
  const isEdit = editRole !== null;

  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [modules, setModules]         = useState<RemoteModule[]>([]);
  const [moduleMap, setModuleMap]     = useState<Record<string, { key: string; label: string }>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [syncError, setSyncError]     = useState<string | null>(null);
  const [syncedAt, setSyncedAt]       = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // ── Reset + load on open ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setSyncError(null);
    setSyncedAt(null);
    setName(isEdit ? editRole.name : "");
    setDescription(isEdit ? (editRole.description ?? "") : "");

    if (isEdit) {
      setSelectedIds(new Set(editRole.permissions.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }

    fetchModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appSlug, isEdit, editRole]);

  // ── Fetch modules from the live app ────────────────────────────────────────
  async function fetchModules() {
    setLoadingPerms(true);
    try {
      const res  = await fetch(`/api/apps/${appSlug}/modules`);
      const json = await res.json();
      if (json.success) {
        setPermissions(json.data.permissions ?? []);
        setModules(json.data.modules ?? []);
        setModuleMap(json.data.moduleMap ?? {});
        setSyncError(json.data.syncError ?? null);
        setSyncedAt(json.data.syncedAt ?? null);
      }
    } catch {
      // leave permissions empty
    } finally {
      setLoadingPerms(false);
    }
  }

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  function togglePermission(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleResource(ids: string[]) {
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      allSelected ? ids.forEach((id) => next.delete(id)) : ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleAction(ids: string[]) {
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      allSelected ? ids.forEach((id) => next.delete(id)) : ids.forEach((id) => next.add(id));
      return next;
    });
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())           { setError("Role name is required"); return; }
    if (selectedIds.size === 0) { setError("Select at least one permission"); return; }
    setError(null);
    setSubmitting(true);

    try {
      const url    = isEdit ? `/api/roles/${editRole.id}` : "/api/roles";
      const method = isEdit ? "PATCH" : "POST";
      // System roles: only permissions can be changed — never send name/description
      const body   = isEdit
        ? isSystemRole
          ? { permissions: Array.from(selectedIds) }
          : { name: name.trim(), description: description.trim() || null, permissions: Array.from(selectedIds) }
        : { name: name.trim(), description: description.trim() || undefined, appSlug, permissions: Array.from(selectedIds) };

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();

      if (json.success) { onSuccess(json.data); onClose(); }
      else setError(json.error ?? "Something went wrong");
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  // ── Matrix data ─────────────────────────────────────────────────────────────
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.resource]) acc[p.resource] = [];
    acc[p.resource].push(p);
    return acc;
  }, {});

  // Order resources by their position in the modules list
  const moduleResourceOrder = modules.flatMap((m) => m.permissions.map((p) => p.resource));
  const resources = Object.keys(grouped).sort((a, b) => {
    const ai = moduleResourceOrder.indexOf(a);
    const bi = moduleResourceOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const allActions = Array.from(new Set(permissions.map((p) => p.action)))
    .sort((a, b) => (ACTION_ORDER[a] ?? 99) - (ACTION_ORDER[b] ?? 99));
  const permsByAction: Record<string, Permission[]> = {};
  allActions.forEach((a) => { permsByAction[a] = permissions.filter((p) => p.action === a); });

  const isSystemRole = isEdit && editRole?.isSystem;

  function resourceLabel(resource: string): string {
    const mod = moduleMap[resource];
    if (mod) return mod.label;
    return resource.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function resourceDescription(resource: string): string | null {
    const modKey = moduleMap[resource]?.key;
    if (!modKey) return null;
    return modules.find((m) => m.key === modKey)?.description ?? null;
  }

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
              <Shield className="h-4 w-4 text-[var(--color-secondary)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                  {isSystemRole ? "Edit Permissions" : isEdit ? "Edit Role" : "Create Role"}
                </h2>
                {isSystemRole && (
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                    System
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)]">{appName}</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Name + Description row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                Role Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text" required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Content Manager"
                disabled={isSystemRole}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
              {isSystemRole && <p className="text-xs text-[var(--color-text-tertiary)]">System role names cannot be changed</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                Description <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span>
              </label>
              <input
                type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe what this role can do"
                maxLength={200}
                disabled={isSystemRole}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
              {isSystemRole && <p className="text-xs text-[var(--color-text-tertiary)]">System role descriptions cannot be changed</p>}
            </div>
          </div>

          {/* Permission Matrix */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                Permissions <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                {!loadingPerms && syncedAt && !syncError && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Synced from {appName}
                  </span>
                )}
                {!loadingPerms && syncError && (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <AlertCircle className="h-3 w-3" />
                    {syncError}
                  </span>
                )}
                <button
                  type="button" onClick={fetchModules} disabled={loadingPerms}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50 transition-colors"
                  title={`Re-fetch modules from ${appName}`}
                >
                  <RefreshCw className={`h-3 w-3 ${loadingPerms ? "animate-spin" : ""}`} />
                  Sync
                </button>
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {selectedIds.size} of {permissions.length} selected
                </span>
              </div>
            </div>

            {loadingPerms ? (
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-text-secondary)]">
                  <RefreshCw className="h-4 w-4 animate-spin text-[var(--color-secondary)]" />
                  Fetching modules from {appName}…
                </div>
              </div>
            ) : resources.length === 0 ? (
              <div className="rounded-xl border border-[var(--color-border)] py-12 flex flex-col items-center gap-3">
                <AlertCircle className="h-8 w-8 text-[var(--color-text-tertiary)]" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No permissions found</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    Make sure {appName} is running, then click <strong>Sync</strong> to fetch its modules.
                  </p>
                </div>
                <button
                  type="button" onClick={fetchModules}
                  className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync from {appName}
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
                      <th className="px-4 py-3 text-left w-52">
                        <div className="flex items-center gap-2.5">
                          <Checkbox
                            checked={selectedIds.size === permissions.length && permissions.length > 0}
                            indeterminate={selectedIds.size > 0 && selectedIds.size < permissions.length}
                            onChange={() => {
                              if (selectedIds.size === permissions.length) {
                                setSelectedIds(new Set());
                              } else {
                                setSelectedIds(new Set(permissions.map((p) => p.id)));
                              }
                            }}
                          />
                          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Module</span>
                        </div>
                      </th>
                      {allActions.map((action) => {
                        const ids        = permsByAction[action].map((p) => p.id);
                        const allSel     = ids.every((id) => selectedIds.has(id));
                        const someSel    = ids.some((id) => selectedIds.has(id));
                        const colorClass = ACTION_COLORS[action] ?? "text-[var(--color-text-secondary)] bg-[var(--color-neutral-100)] border-[var(--color-border)]";
                        return (
                          <th key={action} className="px-3 py-3 text-center">
                            <button type="button" onClick={() => toggleAction(ids)} className="group flex flex-col items-center gap-1.5 w-full">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-opacity ${colorClass} ${
                                allSel ? "opacity-100" : someSel ? "opacity-70" : "opacity-40 group-hover:opacity-70"
                              }`}>
                                {ACTION_LABELS[action] ?? action}
                              </span>
                              <Checkbox
                                checked={allSel}
                                indeterminate={someSel && !allSel}
                                onChange={() => toggleAction(ids)}
                              />
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[var(--color-border)]">
                    {resources.map((resource) => {
                      const perms        = (grouped[resource] ?? []).sort((a, b) => (ACTION_ORDER[a.action] ?? 99) - (ACTION_ORDER[b.action] ?? 99));
                      const permIds      = perms.map((p) => p.id);
                      const allSelected  = permIds.every((id) => selectedIds.has(id));
                      const someSelected = permIds.some((id) => selectedIds.has(id));
                      const actionMap    = Object.fromEntries(perms.map((p) => [p.action, p]));
                      const selected     = permIds.filter((id) => selectedIds.has(id)).length;
                      const modDesc      = resourceDescription(resource);

                      return (
                        <tr key={resource} className={`transition-colors hover:bg-[var(--color-bg-secondary)] ${someSelected ? "bg-[var(--color-secondary-light)]/20" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Checkbox
                                checked={allSelected}
                                indeterminate={someSelected && !allSelected}
                                onChange={() => toggleResource(permIds)}
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-[var(--color-text-primary)] truncate">{resourceLabel(resource)}</p>
                                {modDesc && (
                                  <p className="text-[10px] text-[var(--color-text-tertiary)] truncate">{modDesc}</p>
                                )}
                              </div>
                              <span className="ml-auto shrink-0 text-xs text-[var(--color-text-tertiary)]">{selected}/{permIds.length}</span>
                            </div>
                          </td>

                          {allActions.map((action) => {
                            const perm    = actionMap[action];
                            const checked = perm ? selectedIds.has(perm.id) : false;
                            return (
                              <td key={action} className="px-3 py-2.5 text-center">
                                {perm ? (
                                  <Checkbox checked={checked} onChange={() => togglePermission(perm.id)} />
                                ) : (
                                  <span className="block h-4 w-4 mx-auto rounded border border-dashed border-[var(--color-border)] opacity-30" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                      <td className="px-4 py-2">
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          {selectedIds.size} permission{selectedIds.size !== 1 ? "s" : ""} selected
                        </span>
                      </td>
                      {allActions.map((action) => {
                        const total  = permsByAction[action]?.length ?? 0;
                        const picked = permsByAction[action]?.filter((p) => selectedIds.has(p.id)).length ?? 0;
                        const c      = ACTION_COLORS[action]?.split(" ")[0] ?? "";
                        return (
                          <td key={action} className="px-3 py-2 text-center">
                            <span className={`text-xs font-medium ${picked > 0 ? c : "text-[var(--color-text-tertiary)]"}`}>
                              {picked}/{total}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4 -mx-6 px-6">
            {error ? <p className="text-sm text-red-500">{error}</p> : <span />}
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} disabled={submitting}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting || loadingPerms}
                className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors disabled:opacity-60">
                {submitting
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : <Shield className="h-4 w-4" />}
                {submitting ? "Saving…" : isSystemRole ? "Save Permissions" : isEdit ? "Save Changes" : "Create Role"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
