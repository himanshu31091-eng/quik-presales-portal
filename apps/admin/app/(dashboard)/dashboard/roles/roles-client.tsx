"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield, Plus, Lock, Users, MoreVertical,
  Pencil, Trash2, MessageSquare, CheckSquare,
  TrendingUp, HardHat, UserCog, LayoutGrid,
} from "lucide-react";
import CreateEditRoleModal from "@/components/roles/create-edit-role-modal";

// ── Types ────────────────────────────────────────────────────────────────────

interface AppRole {
  id:              string;
  name:            string;
  description:     string | null;
  isSystem:        boolean;
  isDefault:       boolean;
  permissionCount: number;
  userCount:       number;
  createdAt:       string;
}

interface RoleDetail {
  id:          string;
  name:        string;
  description: string | null;
  isSystem:    boolean;
  permissions: { id: string; resource: string; action: string; label: string }[];
}

interface ProvisionedApp {
  id:   string;
  name: string;
  slug: string;
}

// ── App meta ─────────────────────────────────────────────────────────────────

const APP_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  quiksocial:      { icon: MessageSquare, color: "text-blue-500",   bg: "bg-blue-50"   },
  quiktrack:       { icon: CheckSquare,   color: "text-green-500",  bg: "bg-green-50"  },
  quikscale:       { icon: TrendingUp,    color: "text-purple-500", bg: "bg-purple-50" },
  constructionerp: { icon: HardHat,       color: "text-amber-500",  bg: "bg-amber-50"  },
  hrms:            { icon: UserCog,       color: "text-rose-500",   bg: "bg-rose-50"   },
};

// ── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  onEdit,
  onDelete,
}: {
  role:     AppRole;
  onEdit:   (role: AppRole) => void;
  onDelete: (role: AppRole) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 hover:border-[var(--color-secondary)] hover:shadow-sm transition-all">

      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary-light)]">
          <Shield className="h-4 w-4 text-[var(--color-secondary)]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[var(--color-text-primary)] truncate">{role.name}</p>
            {role.isSystem && (
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                System
              </span>
            )}
            {role.isDefault && (
              <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-600">
                Default
              </span>
            )}
          </div>
          {role.description && (
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] line-clamp-2">{role.description}</p>
          )}
        </div>

        {/* Menu — only for custom roles */}
        {!role.isSystem && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-xl">
                <button
                  onClick={() => { setMenuOpen(false); onEdit(role); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                  Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(role); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}

        {/* Edit-only button for system roles */}
        {role.isSystem && (
          <button
            onClick={() => onEdit(role)}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit Permissions
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 border-t border-[var(--color-border)] pt-3">
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
          <span className="text-xs text-[var(--color-text-secondary)]">
            {role.permissionCount} permission{role.permissionCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
          <span className="text-xs text-[var(--color-text-secondary)]">
            {role.userCount} member{role.userCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function RoleSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-[var(--color-neutral-100)]" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 rounded bg-[var(--color-neutral-100)]" />
          <div className="h-3 w-48 rounded bg-[var(--color-neutral-100)]" />
        </div>
      </div>
      <div className="flex gap-4 border-t border-[var(--color-border)] pt-3">
        <div className="h-3 w-24 rounded bg-[var(--color-neutral-100)]" />
        <div className="h-3 w-20 rounded bg-[var(--color-neutral-100)]" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RolesPageClient({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ appId?: string; userId?: string }>;
}) {
  const [apps, setApps]                       = useState<ProvisionedApp[]>([]);
  const [selectedApp, setSelectedApp]         = useState<ProvisionedApp | null>(null);
  const [roles, setRoles]                     = useState<AppRole[]>([]);
  const [loadingApps, setLoadingApps]         = useState(true);
  const [loadingRoles, setLoadingRoles]       = useState(false);
  const [modalOpen, setModalOpen]             = useState(false);
  const [editRole, setEditRole]               = useState<RoleDetail | null>(null);
  const [deleteTarget, setDeleteTarget]       = useState<AppRole | null>(null);
  const [deleting, setDeleting]               = useState(false);
  const [deleteError, setDeleteError]         = useState<string | null>(null);

  // Load provisioned apps
  useEffect(() => {
    fetch("/api/apps/provisioned")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setApps(res.data);
          setSelectedApp(res.data[0]);
        }
      })
      .finally(() => setLoadingApps(false));
  }, []);

  // Load roles when selected app changes
  const loadRoles = useCallback(async (appSlug: string) => {
    setLoadingRoles(true);
    try {
      const res  = await fetch(`/api/roles?appSlug=${appSlug}`);
      const json = await res.json();
      if (json.success) setRoles(json.data);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    if (selectedApp) loadRoles(selectedApp.slug);
  }, [selectedApp, loadRoles]);

  // Open create modal
  function handleCreate() {
    setEditRole(null);
    setModalOpen(true);
  }

  // Open edit modal — fetch full role detail first
  async function handleEdit(role: AppRole) {
    const res  = await fetch(`/api/roles/${role.id}`);
    const json = await res.json();
    if (json.success) {
      setEditRole(json.data as RoleDetail);
      setModalOpen(true);
    }
  }

  // Optimistic add on create / update on edit
  function handleSuccess(updated: AppRole) {
    setRoles((prev) => {
      const exists = prev.find((r) => r.id === updated.id);
      return exists
        ? prev.map((r) => (r.id === updated.id ? updated : r))
        : [updated, ...prev];
    });
  }

  // Delete
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res  = await fetch(`/api/roles/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setRoles((prev) => prev.filter((r) => r.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setDeleteError(json.error ?? "Failed to delete role");
      }
    } catch {
      setDeleteError("Network error — please try again");
    } finally {
      setDeleting(false);
    }
  }

  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Roles & Permissions</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Manage <span className="text-[var(--color-secondary)]">custom roles</span> and control feature access per application
          </p>
        </div>
        {selectedApp && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Role
          </button>
        )}
      </div>

      {/* App Tabs */}
      {loadingApps ? (
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-28 rounded-lg bg-[var(--color-neutral-100)] animate-pulse" />
          ))}
        </div>
      ) : apps.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {apps.map((app) => {
            const meta     = APP_META[app.slug];
            const Icon     = meta?.icon ?? LayoutGrid;
            const isActive = selectedApp?.slug === app.slug;
            return (
              <button
                key={app.slug}
                onClick={() => setSelectedApp(app)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "border-[var(--color-secondary)] bg-[var(--color-secondary-light)] text-[var(--color-secondary)]"
                    : "border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-[var(--color-secondary)]" : meta?.color ?? "text-[var(--color-text-tertiary)]"}`} />
                {app.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Roles content */}
      {!selectedApp ? (
        <div className="rounded-xl border border-[var(--color-border)] border-dashed py-20 flex flex-col items-center gap-3">
          <Shield className="h-10 w-10 text-[var(--color-text-tertiary)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">No apps provisioned for this organisation</p>
        </div>
      ) : loadingRoles ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="h-4 w-32 rounded bg-[var(--color-neutral-100)] animate-pulse" />
            <div className="grid gap-4 sm:grid-cols-2">
              <RoleSkeleton /><RoleSkeleton />
            </div>
          </section>
          <section className="space-y-3">
            <div className="h-4 w-32 rounded bg-[var(--color-neutral-100)] animate-pulse" />
            <div className="grid gap-4 sm:grid-cols-2">
              <RoleSkeleton /><RoleSkeleton />
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-8">

          {/* System Roles */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                System Roles
              </h2>
              <span className="text-xs text-[var(--color-text-tertiary)]">— cannot be deleted or renamed</span>
            </div>
            {systemRoles.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {systemRoles.map((role) => (
                  <RoleCard key={role.id} role={role} onEdit={handleEdit} onDelete={setDeleteTarget} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--color-border)] border-dashed py-10 flex items-center justify-center">
                <p className="text-sm text-[var(--color-text-tertiary)]">No system roles found for this app</p>
              </div>
            )}
          </section>

          {/* Custom Roles */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Custom Roles
                </h2>
                {customRoles.length > 0 && (
                  <span className="rounded-full bg-[var(--color-secondary-light)] px-2 py-0.5 text-xs font-semibold text-[var(--color-secondary)]">
                    {customRoles.length}
                  </span>
                )}
              </div>
              <button
                onClick={handleCreate}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-secondary)] hover:bg-[var(--color-secondary-light)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Role
              </button>
            </div>

            {customRoles.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {customRoles.map((role) => (
                  <RoleCard key={role.id} role={role} onEdit={handleEdit} onDelete={setDeleteTarget} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--color-border)] border-dashed bg-[var(--color-bg-primary)] py-14 flex flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
                  <Shield className="h-6 w-6 text-[var(--color-text-tertiary)]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No custom roles yet</p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Create roles to give specific feature access for {selectedApp.name}
                  </p>
                </div>
                <button
                  onClick={handleCreate}
                  className="mt-1 flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create your first role
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-2xl mx-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Delete Role?</h3>
                <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                  <strong className="text-[var(--color-text-primary)]">{deleteTarget.name}</strong> will be permanently deleted.
                  This cannot be undone.
                </p>
                {deleteError && (
                  <p className="mt-2 text-sm text-red-500">{deleteError}</p>
                )}
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleting}
                className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {deleting
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : <Trash2 className="h-4 w-4" />
                }
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {selectedApp && (
        <CreateEditRoleModal
          open={modalOpen}
          appSlug={selectedApp.slug}
          appName={selectedApp.name}
          editRole={editRole}
          onClose={() => { setModalOpen(false); setEditRole(null); }}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
