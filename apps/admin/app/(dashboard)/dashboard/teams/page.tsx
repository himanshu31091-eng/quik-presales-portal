"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Search, Users, LayoutGrid, MoreVertical,
  Pencil, Trash2,
  MessageSquare, CheckSquare, TrendingUp, HardHat, UserCog,
} from "lucide-react";
import CreateTeamModal, { type TeamRow } from "@/components/teams/create-team-modal";
import EditTeamModal from "@/components/teams/edit-team-modal";

const APP_META: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  quiksocial:      { icon: MessageSquare, color: "text-blue-500",   bg: "bg-blue-50",   label: "QuikSocial" },
  quiktrack:       { icon: CheckSquare,   color: "text-green-500",  bg: "bg-green-50",  label: "QuikTrack" },
  quikscale:       { icon: TrendingUp,    color: "text-purple-500", bg: "bg-purple-50", label: "QuikScale" },
  constructionerp: { icon: HardHat,       color: "text-amber-500",  bg: "bg-amber-50",  label: "ConstructionERP" },
  hrms:            { icon: UserCog,       color: "text-rose-500",   bg: "bg-rose-50",   label: "HRMS" },
};

function TeamCard({
  team,
  onEdit,
  onDelete,
}: {
  team: TeamRow;
  onEdit: (team: TeamRow) => void;
  onDelete: (team: TeamRow) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef                 = useRef<HTMLDivElement>(null);

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 hover:border-[var(--color-secondary)] hover:shadow-sm transition-all">

      {/* Top row: color swatch + name + menu */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--color-text-primary)] truncate">{team.name}</p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* 3-dot menu */}
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
                onClick={() => { setMenuOpen(false); onEdit(team); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                Edit
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(team); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* App badges */}
      {team.apps.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {team.apps.map(({ slug, name }) => {
            const meta = APP_META[slug];
            const Icon = meta?.icon ?? LayoutGrid;
            return (
              <span
                key={slug}
                title={name}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta?.bg ?? "bg-[var(--color-neutral-100)]"} ${meta?.color ?? "text-[var(--color-text-secondary)]"}`}
              >
                <Icon className="h-3 w-3" />
                {meta?.label ?? name}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-tertiary)]">No apps assigned</p>
      )}

      {/* Member avatar stack */}
      {team.members.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {team.members.slice(0, 4).map((m, i) => (
              <span
                key={i}
                title={m.name}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--color-bg-primary)] bg-[var(--color-secondary-light)] text-[10px] font-semibold text-[var(--color-secondary)]"
              >
                {initials(m.name || "?")}
              </span>
            ))}
            {team.memberCount > 4 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--color-bg-primary)] bg-[var(--color-neutral-100)] text-[10px] font-semibold text-[var(--color-text-secondary)]">
                +{team.memberCount - 4}
              </span>
            )}
          </div>
          {team.members[0]?.name && (
            <span className="text-xs text-[var(--color-text-tertiary)] truncate">
              {team.members[0].name}
              {team.memberCount > 1 ? ` + ${team.memberCount - 1} more` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamsPage() {
  const [teams, setTeams]               = useState<TeamRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [createOpen, setCreateOpen]     = useState(false);
  const [editTarget, setEditTarget]     = useState<TeamRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null);

  const loadTeams = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res  = await fetch("/api/teams", { signal });
      const json = await res.json();
      if (json.success) setTeams(json.data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadTeams(controller.signal);
    return () => controller.abort();
  }, [loadTeams]);

  function handleCreated(team: TeamRow) {
    setTeams((prev) => [team, ...prev]);
  }

  function handleUpdated(updated: TeamRow) {
    setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setTeams((prev) => prev.filter((t) => t.id !== target.id));
    try {
      const res  = await fetch(`/api/teams/${target.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) setTeams((prev) => [target, ...prev]);
    } catch {
      setTeams((prev) => [target, ...prev]);
    }
  }

  const filtered = teams.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Teams</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
            Organise <span className="text-[var(--color-secondary)]">members</span> into departments and groups
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Team
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teams…"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        />
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-[var(--color-neutral-100)]" />
                <div className="h-4 w-32 rounded bg-[var(--color-neutral-100)]" />
              </div>
              <div className="flex gap-2">
                <div className="h-5 w-20 rounded-full bg-[var(--color-neutral-100)]" />
                <div className="h-5 w-20 rounded-full bg-[var(--color-neutral-100)]" />
              </div>
              <div className="flex gap-1">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-7 w-7 rounded-full bg-[var(--color-neutral-100)]" />
                ))}
              </div>
            </div>
          ))}
        </div>

      ) : filtered.length > 0 ? (
        /* ── List view ──────────────────────────────────────────────────── */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] border-dashed bg-[var(--color-bg-primary)] py-20 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-neutral-100)]">
            <Users className="h-6 w-6 text-[var(--color-text-tertiary)]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">No teams created yet</p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Create teams to organise members and define permissions by department
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create your first team
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] py-16 flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No teams match &ldquo;{search}&rdquo;</p>
          <p className="text-sm text-[var(--color-text-secondary)]">Try a different name</p>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6 shadow-2xl mx-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Delete Team?</h3>
                <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                  <strong className="text-[var(--color-text-primary)]">{deleteTarget.name}</strong> will be permanently deleted.
                  Members will not lose their app access.
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateTeamModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleCreated}
      />

      <EditTeamModal
        open={editTarget !== null}
        teamId={editTarget?.id ?? null}
        onClose={() => setEditTarget(null)}
        onSuccess={handleUpdated}
      />
    </div>
  );
}
