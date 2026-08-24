"use client";

import { useState, useRef, useEffect, type UIEvent } from "react";

function avatarBg(name: string): string {
  const colors = [
    "bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500",
    "bg-rose-500","bg-cyan-500","bg-fuchsia-500","bg-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

export function userToFilterOption(u: {
  id: string; firstName: string; lastName: string; email: string;
}): FilterOption {
  const full = `${u.firstName} ${u.lastName}`;
  return {
    value: u.id,
    label: full,
    sublabel: u.email,
    avatarInitials: `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase(),
    avatarColor: avatarBg(full),
  };
}

export interface FilterOption {
  value: string;
  label: string;
  sublabel?: string;
  avatarInitials?: string;
  avatarColor?: string;
}

interface FilterPickerProps {
  value: string;
  onChange: (val: string) => void;
  options: FilterOption[];
  allLabel?: string;
  placeholder?: string;
  /**
   * Optional infinite-scroll hooks. Pass these when `options` is a paginated
   * server-side slice that should grow as the user scrolls. Callers that pass
   * the full list of options can omit all three — behavior is unchanged.
   *
   *   - `onLoadMore`: invoked when the dropdown's scroll position nears the
   *     bottom of the list. Wire to your infinite-query's `fetchNextPage`.
   *   - `hasMore`: true while more pages remain on the server.
   *   - `loadingMore`: true while the next page is in flight (controls the
   *     "Loading more…" footer and suppresses duplicate fetches).
   */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  /**
   * Optional server-side search. When provided, the picker stops filtering
   * `options` locally and instead reports the (debounced) query string here —
   * the caller is expected to feed back the matching `options`. Use this when
   * `options` is a paginated/searched server slice so that members beyond the
   * first page are still findable (otherwise typing only matches the loaded
   * page and everyone else shows "No results"). Omit it to keep the default
   * behavior: client-side filtering over the full `options` list.
   */
  onSearchChange?: (query: string) => void;
  /** True while a server-side search / page fetch is in flight (server mode). */
  loading?: boolean;
  /**
   * Fallback option used to render the trigger label when `value` is set but
   * the matching option isn't in the loaded `options` slice (e.g. a
   * server-paginated list whose selected row sits beyond page 1, or a filter
   * restored from persisted state and never picked in this session). Without
   * it the trigger would wrongly fall back to `allLabel`. Only its label /
   * avatar are used, and only when `selectedOption.value === value`.
   */
  selectedOption?: FilterOption;
}

export function FilterPicker({
  value,
  onChange,
  options,
  allLabel = "All",
  placeholder = "Search...",
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  onSearchChange,
  loading = false,
  selectedOption,
}: FilterPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Remembers the option the user last picked so the trigger button can keep
  // showing its label even after `options` changes (e.g. a server-side search
  // narrows the list, or it resets to page 1) and no longer contains it.
  const [lastSelected, setLastSelected] = useState<FilterOption | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isServerSearch = !!onSearchChange;

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function closeAndRefocus() {
    setOpen(false);
    setSearch("");
    triggerRef.current?.focus();
  }

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeAndRefocus();
    }
  }

  // Server-search mode: report the query to the caller, debounced so we don't
  // refetch on every keystroke. Kept in a ref so an inline `onSearchChange`
  // callback identity change can't reset the debounce timer each render.
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => { onSearchChangeRef.current = onSearchChange; });
  useEffect(() => {
    if (!onSearchChangeRef.current) return;
    const handle = setTimeout(() => onSearchChangeRef.current?.(search.trim()), 250);
    return () => clearTimeout(handle);
  }, [search]);

  // In server-search mode the caller supplies already-matched options, so render
  // them as-is. In client mode, filter the full options list locally.
  const selected =
    options.find(o => o.value === value) ??
    (lastSelected && lastSelected.value === value ? lastSelected : undefined) ??
    (selectedOption && selectedOption.value === value ? selectedOption : undefined);
  const filtered = isServerSearch
    ? options
    : search.trim()
      ? options.filter(o =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.sublabel?.toLowerCase().includes(search.toLowerCase()))
        )
      : options;

  function select(val: string) {
    setLastSelected(val ? (options.find(o => o.value === val) ?? null) : null);
    onChange(val);
    setOpen(false);
    setSearch("");
  }

  // Infinite-scroll trigger: when the dropdown list is within ~40px of the
  // bottom and there's a next page available, fire `onLoadMore`. Guarded on
  // `loadingMore` so we don't queue duplicate fetches while one is in flight.
  // In client mode a search only filters the already-loaded slice, so paging in
  // unrelated rows would be pointless — we suppress fetches while typing. In
  // server-search mode the next page contains more *matches*, so we keep paging.
  function handleScroll(e: UIEvent<HTMLDivElement>) {
    if (!onLoadMore || !hasMore || loadingMore) return;
    if (!isServerSearch && search.trim()) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      onLoadMore();
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-accent-400 transition-colors ${
          open ? "border-accent-300 ring-1 ring-accent-400" : "border-gray-200"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected?.avatarInitials && (
            <span className={`h-4 w-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0 ${selected.avatarColor ?? "bg-gray-400"}`}>
              {selected.avatarInitials}
            </span>
          )}
          <span className={`truncate ${selected ? "text-gray-700" : "text-gray-400"}`}>
            {selected ? selected.label : allLabel}
          </span>
        </span>
        <svg
          className={`h-3 w-3 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-xl z-[100] overflow-hidden"
          onKeyDown={handleMenuKeyDown}
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                autoFocus
                type="text"
                placeholder={placeholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 placeholder-gray-400"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto" role="listbox" onScroll={handleScroll}>
            {/* All option */}
            {!search.trim() && (
              <button
                role="option"
                aria-selected={!value}
                onClick={() => select("")}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  !value ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className={`w-3.5 h-3.5 flex-shrink-0 ${!value ? "opacity-100" : "opacity-0"}`}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-xs font-medium">{allLabel}</span>
              </button>
            )}

            {filtered.map(opt => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => select(opt.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    isSelected ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>

                  {opt.avatarInitials && (
                    <span className={`h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${opt.avatarColor ?? "bg-gray-400"}`}>
                      {opt.avatarInitials}
                    </span>
                  )}

                  <div className="min-w-0">
                    <span className="block text-xs truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className={`block text-[10px] truncate ${isSelected ? "text-gray-300" : "text-gray-500"}`}>
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">
                {isServerSearch && loading ? "Searching…" : "No results"}
              </div>
            )}

            {/* Infinite-scroll loading footer. Only renders when the caller
                opts in via `onLoadMore` AND a fetch is in flight. */}
            {onLoadMore && loadingMore && (
              <div className="px-3 py-2 text-[10px] text-gray-500 text-center border-t border-gray-100">
                Loading more…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
