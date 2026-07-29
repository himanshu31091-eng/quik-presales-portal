"use client";

/**
 * UserSelect -- unified user picker (single / multi) with searchable dropdown.
 *
 * Mode determines the rendered trigger + selection model:
 *   - "single" -> one avatar + name shown; onChange(id: string)
 *   - "multi"  -> chip list of selected users; onChange(ids: string[])
 *
 * Features shared across modes:
 *   - Click-outside closes the dropdown
 *   - Search box filters by name or email
 *   - Selected items highlighted with accent colors
 *   - Keyboard-accessible (autofocus on search, button elements)
 */
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, X } from "lucide-react";

/** Where the dropdown is painted (fixed, viewport-relative) + its height cap. */
interface MenuPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export interface PickerUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

function avatarBg(name: string): string {
  const colors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

// -- Mode-specific prop unions --
interface BaseProps {
  users: PickerUser[];
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  /**
   * Optional infinite-scroll hooks. Pass these when `users` is a paginated
   * server slice that should grow as the dropdown scrolls. Wire `onLoadMore`
   * to an infinite-query's `fetchNextPage`. Callers passing the full list omit
   * all of these — behaviour is unchanged.
   */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  /**
   * Optional server-side search. When provided, the picker stops filtering
   * `users` locally and reports the (debounced) query here; the caller feeds
   * back the matching `users`. Use with paginated/searched server slices so
   * members past the first page stay findable.
   */
  onSearchChange?: (query: string) => void;
  /** True while a server search / page fetch is in flight (server mode). */
  loading?: boolean;
  /**
   * Full objects for the currently-selected users. In server-pagination mode
   * the selected member may not be in the loaded `users` slice — pass them here
   * so multi-select chips (and the selected-state) still render correctly.
   */
  selectedUsers?: PickerUser[];
}

interface SingleProps extends BaseProps {
  mode: "single";
  value: string;
  onChange: (id: string) => void;
}

interface MultiProps extends BaseProps {
  mode: "multi";
  values: string[];
  onChange: (ids: string[]) => void;
  /** Max items to show as chips in the trigger before collapsing. */
  chipLimit?: number;
}

export type UserSelectProps = SingleProps | MultiProps;

export function UserSelect(props: UserSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  // The dropdown is rendered in a portal with `position: fixed` so it escapes
  // any `overflow-y-auto` ancestor (e.g. the RightPanel form body). Without
  // this it was clipped by the scroll container on short screens, so the
  // lower options were unreachable. We anchor it to the trigger's rect and
  // flip it above the trigger when there isn't room below.
  const updatePosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const GAP = 4;
    const MARGIN = 8; // keep a little breathing room from the viewport edge
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const avail = (openUp ? spaceAbove : spaceBelow) - GAP - MARGIN;
    const maxHeight = Math.max(180, Math.min(360, avail));
    setPos({
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
      maxHeight,
    });
  }, []);

  // Position the menu when it opens; clear it when closed. We gate the menu's
  // render on `pos` so it never flashes at the wrong spot before measuring.
  useEffect(() => {
    if (open) updatePosition();
    else setPos(null);
  }, [open, updatePosition]);

  // Keep the menu pinned to the trigger while the form body scrolls / resizes
  // (capture phase catches scrolls on inner overflow containers too).
  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const { users, placeholder, error, mode, disabled, onLoadMore, hasMore, loadingMore, onSearchChange, loading, selectedUsers } = props;
  const isServerSearch = !!onSearchChange;

  // Server-search mode: report the debounced query to the caller (kept in a
  // ref so an inline callback's identity change can't reset the timer).
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => { onSearchChangeRef.current = onSearchChange; });
  useEffect(() => {
    if (!onSearchChangeRef.current) return;
    const handle = setTimeout(() => onSearchChangeRef.current?.(search.trim()), 250);
    return () => clearTimeout(handle);
  }, [search]);

  // Remember every user we've ever rendered so multi-select chips for members
  // selected on an earlier page survive scrolling/searching to other pages.
  const seenRef = useRef<Map<string, PickerUser>>(new Map());
  for (const u of users) seenRef.current.set(u.id, u);
  for (const u of selectedUsers ?? []) seenRef.current.set(u.id, u);
  const knownById = seenRef.current;

  // In server-search mode the caller supplies already-matched users; render
  // them as-is. In client mode, filter the full list locally.
  const filtered = isServerSearch
    ? users
    : search.trim()
      ? users.filter(u =>
          `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
        )
      : users;

  // Infinite-scroll trigger — fire `onLoadMore` when near the bottom. Suppress
  // while a fetch is in flight, and (client mode only) while a local search is
  // active, since paging in unrelated rows wouldn't help there.
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!onLoadMore || !hasMore || loadingMore) return;
    if (!isServerSearch && search.trim()) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) onLoadMore();
  }

  // -- Trigger rendering --
  let trigger: ReactNode;
  if (mode === "single") {
    const selected = knownById.get(props.value);
    trigger = selected ? (
      <div className="flex items-center gap-2">
        <div className={`h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avatarBg(`${selected.firstName} ${selected.lastName}`)}`}>
          {initials(selected.firstName, selected.lastName)}
        </div>
        <span className="text-gray-700">{selected.firstName} {selected.lastName}</span>
      </div>
    ) : (
      <span className="text-gray-400">{placeholder ?? "Select owner\u2026"}</span>
    );
  } else {
    const chipLimit = props.chipLimit ?? 2;
    // Resolve selected ids \u2192 full objects via the "known" cache so chips for
    // members selected on an earlier (now-unloaded) page still render.
    const selectedChipUsers = props.values
      .map(id => knownById.get(id))
      .filter((u): u is PickerUser => !!u);
    trigger = selectedChipUsers.length === 0 ? (
      <span className="text-gray-400">{placeholder ?? "Select owners\u2026"}</span>
    ) : (
      <div className="scrollbar-visible flex items-center gap-1.5 flex-wrap min-w-0 max-h-20 overflow-y-auto pr-1">
        {selectedChipUsers.slice(0, chipLimit).map(u => (
          <span key={u.id} className="inline-flex items-center gap-1 bg-accent-50 border border-accent-200 text-accent-700 rounded-full pl-0.5 pr-2 py-0.5">
            <span className={`h-4 w-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0 ${avatarBg(`${u.firstName} ${u.lastName}`)}`}>
              {initials(u.firstName, u.lastName)}
            </span>
            <span className="text-[10px] font-medium truncate max-w-[72px]">{u.firstName} {u.lastName[0] ?? ""}</span>
          </span>
        ))}
        {selectedChipUsers.length > chipLimit && (
          <span className="text-[10px] text-gray-500 font-medium">+{selectedChipUsers.length - chipLimit} more</span>
        )}
      </div>
    );
  }

  // -- Item click handler --
  function handleItemClick(userId: string) {
    if (mode === "single") {
      props.onChange(userId);
      setOpen(false);
    } else {
      const selectedSet = new Set(props.values);
      if (selectedSet.has(userId)) props.onChange(props.values.filter(v => v !== userId));
      else props.onChange([...props.values, userId]);
    }
  }

  function handleClearAll() {
    if (mode === "single") {
      props.onChange("");
      setOpen(false);
    } else {
      props.onChange([]);
    }
  }

  const hasSelection = mode === "single" ? !!props.value : props.values.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { if (!disabled) { setOpen(o => !o); setSearch(""); } }}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-xs focus:outline-none ${disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed border-gray-200" : `bg-white hover:bg-gray-50 focus:ring-1 focus:ring-accent-400 ${error ? "border-red-400" : "border-gray-200"}`}`}
      >
        {trigger}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: pos.left,
            width: pos.width,
            ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            maxHeight: pos.maxHeight,
          }}
          className="z-[260] bg-white border border-gray-200 rounded-xl shadow-lg min-w-[240px] flex flex-col"
        >
          {/* Search + optional Clear \u2014 fixed, never scrolls away */}
          <div className="p-2 border-b border-gray-100 flex gap-2 flex-shrink-0">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={"Search\u2026"}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            {mode === "multi" && hasSelection && (
              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-red-500 px-2 rounded hover:bg-red-50 transition-colors"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {/* Items \u2014 the only scrolling region; min-h-0 lets it shrink to fit.
              `scrollbar-visible` opts back in to a visible scrollbar (hidden
              globally) so long member lists read as scrollable. */}
          <div className="scrollbar-visible flex-1 min-h-0 overflow-y-auto py-1" onScroll={handleScroll}>
            {/* Single-mode "clear selection" row */}
            {mode === "single" && props.value && (
              <button
                type="button"
                onClick={handleClearAll}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 italic"
              >
                — Clear selection
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">
                {isServerSearch && (loading || loadingMore) ? "Searching…" : "No users match."}
              </p>
            ) : filtered.map(u => {
              const full = `${u.firstName} ${u.lastName}`;
              const isSelected = mode === "single"
                ? u.id === props.value
                : props.values.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleItemClick(u.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors ${isSelected ? "bg-accent-50" : ""}`}
                >
                  {mode === "multi" && (
                    <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-accent-600 border-accent-600" : "border-gray-300 bg-white"}`}>
                      {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                  )}
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avatarBg(full)}`}>
                    {initials(u.firstName, u.lastName)}
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <span className={`block text-xs font-medium truncate ${isSelected ? "text-accent-700" : "text-gray-800"}`}>{full}</span>
                    <span className="block text-[10px] text-gray-400 truncate">{u.email}</span>
                  </div>
                </button>
              );
            })}

            {/* Infinite-scroll footer — only when the caller opts in. */}
            {onLoadMore && loadingMore && filtered.length > 0 && (
              <div className="px-3 py-2 text-[10px] text-gray-400 text-center border-t border-gray-100">
                Loading more…
              </div>
            )}
          </div>

          {/* Multi-mode count footer — fixed at the bottom of the menu */}
          {mode === "multi" && props.values.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-500 bg-gray-50 rounded-b-xl flex-shrink-0">
              {props.values.length} selected
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
