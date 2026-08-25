"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Building2, ChevronDown, Search, X } from "lucide-react";
import { cn } from "../lib/utils";

export interface TenantOption {
  id: string;
  name: string;
  /** Optional slug / plan / status for the secondary line. */
  slug?: string;
  plan?: string;
}

export interface TenantPickerProps {
  /** Full list. If the list is large, pass already-filtered results and handle search server-side via onSearchChange. */
  tenants: TenantOption[];
  /** Selected tenant id, or null if nothing selected yet. */
  value: string | null;
  onChange: (orgId: string) => void;
  /** Called as the user types, so callers can server-side filter. Optional. */
  onSearchChange?: (query: string) => void;
  /** Show a loading state (waiting for tenants to load). */
  loading?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Searchable tenant dropdown for super admin flows. Two useful modes:
 *
 *   - Client-side filter: pass the full list; the component filters locally.
 *   - Server-side filter: pass the already-filtered list plus `onSearchChange`;
 *     the component will call the handler on keystroke (debounce lives in caller).
 *
 * Design choices:
 *   - Keyboard: ArrowUp/Down to navigate, Enter to select, Esc to close.
 *   - Click-outside closes the dropdown.
 *   - Current selection shown in the trigger; click clears via the `x` button.
 */
export function TenantPicker({
  tenants,
  value,
  onChange,
  onSearchChange,
  loading = false,
  placeholder = "Select a tenant…",
  className,
}: TenantPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Stable ids so the search input can point aria-activedescendant at the
  // highlighted row — without it, arrow-key navigation is silent to a screen
  // reader even though it works visually.
  const listboxId = useId();
  const optionId = (tenantId: string) => `${listboxId}-opt-${tenantId}`;

  const selected = tenants.find((t) => t.id === value) ?? null;

  // Client-side filter when no server-side handler is provided
  const filtered = onSearchChange
    ? tenants
    : tenants.filter((t) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          (t.slug ?? "").toLowerCase().includes(q)
        );
      });

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the search input on open, reset highlight
  useEffect(() => {
    if (open) {
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keep highlight in bounds as the list changes
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlight]);

  function commitSelection(t: TenantOption) {
    onChange(t.id);
    setOpen(false);
    setQuery("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const t = filtered[highlight];
      if (t) commitSelection(t);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-left",
          "hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-700",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
          {selected ? (
            <div className="min-w-0">
              <div className="text-gray-900 font-medium truncate">{selected.name}</div>
              {(selected.slug || selected.plan) && (
                <div className="text-[11px] text-gray-500 truncate">
                  {selected.slug}{selected.plan ? ` · ${selected.plan}` : ""}
                </div>
              )}
            </div>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-gray-400 flex-shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="relative border-b border-gray-100">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              onKeyDown={handleKey}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={filtered[highlight] ? optionId(filtered[highlight].id) : undefined}
              aria-autocomplete="list"
              placeholder="Search tenants…"
              // `focus:outline-none` with no replacement left this field with no
              // visible focus indicator at all (WCAG 2.4.7). Ring matches the
              // trigger button above.
              className="w-full pl-9 pr-9 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-accent-700 rounded"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  onSearchChange?.("");
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div id={listboxId} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-4 text-center text-sm text-gray-500">Loading…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-gray-500">No tenants found.</div>
            )}
            {!loading &&
              filtered.map((t, i) => (
                <button
                  key={t.id}
                  id={optionId(t.id)}
                  role="option"
                  aria-selected={t.id === value}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => commitSelection(t)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                    i === highlight ? "bg-accent-50" : "hover:bg-gray-50",
                    t.id === value && "font-semibold",
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-gray-900 truncate">{t.name}</div>
                    {(t.slug || t.plan) && (
                      <div className="text-[11px] text-gray-500 truncate">
                        {t.slug}{t.plan ? ` · ${t.plan}` : ""}
                      </div>
                    )}
                  </div>
                  {t.id === value && <span className="text-accent-600 text-xs">Selected</span>}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
