"use client";

/**
 * Generic searchable single-select dropdown — same trigger + open-card
 * aesthetic as UserPicker but for non-people lists (status, currency,
 * year, role, plan, etc.).
 *
 *   - searchable: false (default) — for ≤8 options. No search box.
 *   - searchable: true            — adds a search input above the list.
 *   - groups                       — optional group headers for nested lists.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional sublabel rendered as a small line under the main label. */
  hint?: string;
  /** Optional group key — when set on every option, items are grouped. */
  group?: string;
}

export interface DropdownPickerProps<T extends string = string> {
  value: T | "";
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  /** Trigger text override when nothing is selected. */
  emptyLabel?: string;
  /** Class name forwarded to the trigger button. */
  className?: string;
  /** Pixel max-height for the open list (default 256). */
  maxListHeight?: number;
}

export function DropdownPicker<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable = false,
  disabled = false,
  className = "",
  maxListHeight = 256,
}: DropdownPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

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

  const selected = options.find((o) => o.value === value);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.hint?.toLowerCase().includes(q) ||
          o.group?.toLowerCase().includes(q)
      )
    : options;

  // Group by `group` field when any option has one.
  const grouped = filtered.reduce<Record<string, DropdownOption<T>[]>>((acc, o) => {
    const k = o.group ?? "";
    (acc[k] ??= []).push(o);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped);
  const showGroups = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== "");

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 ${
          disabled
            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-70"
            : "border-gray-200 hover:bg-gray-50 text-gray-800"
        }`}
      >
        <span className="truncate text-left">
          {selected ? selected.label : <span className="text-gray-400">{placeholder}</span>}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
          onKeyDown={handleMenuKeyDown}
        >
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full px-3 py-1.5 text-xs border border-accent-300 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>
          )}

          <div className="overflow-y-auto" role="listbox" style={{ maxHeight: maxListHeight }}>
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs italic text-gray-400">No matches</p>
            ) : showGroups ? (
              groupKeys.map((g) => (
                <div key={g}>
                  {g && (
                    <p className="sticky top-0 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      {g}
                    </p>
                  )}
                  {grouped[g].map((opt) => (
                    <Item key={opt.value} opt={opt} selected={opt.value === value} onPick={(v) => { onChange(v); setOpen(false); setSearch(""); }} />
                  ))}
                </div>
              ))
            ) : (
              filtered.map((opt) => (
                <Item key={opt.value} opt={opt} selected={opt.value === value} onPick={(v) => { onChange(v); setOpen(false); setSearch(""); }} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Item<T extends string>({ opt, selected, onPick }: { opt: DropdownOption<T>; selected: boolean; onPick: (v: T) => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onPick(opt.value)}
      className={`w-full flex items-start gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 ${
        selected ? "bg-accent-50 text-accent-700" : "text-gray-800"
      }`}
    >
      <span className="w-4 flex-shrink-0 mt-0.5">
        {selected && <Check className="h-3.5 w-3.5 text-accent-600" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate font-medium">{opt.label}</span>
        {opt.hint && <span className="block truncate text-[11px] text-gray-400">{opt.hint}</span>}
      </span>
    </button>
  );
}
