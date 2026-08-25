"use client";

/**
 * Calendar date picker — replaces native <input type="date">.
 *
 * Single mode: emits ISO yyyy-mm-dd via onChange(date: string).
 * Range mode (mode="range"): emits {from, to} via onChange.
 *
 * Week starts on the day given by `weekStartDay` (0 = Sunday … 6 = Saturday).
 * Caller should derive this from Tenant.weekStartDay.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface DatePickerProps {
  /** ISO yyyy-mm-dd (single mode). Empty string when nothing picked. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  weekStartDay?: number;
  className?: string;
  /** Min / max ISO date strings (yyyy-mm-dd). */
  min?: string;
  max?: string;
}

function fmt(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DatePicker({
  value, onChange, placeholder = "Select date", disabled, weekStartDay = 0, className = "", min, max,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const today = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => toISO(today), [today]);

  const initialMonth = useMemo(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }, [value, today]);
  const [view, setView] = useState<Date>(initialMonth);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function closeAndRefocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handlePopoverKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeAndRefocus();
    }
  }

  // Compute visible 6×7 grid (always 42 cells).
  const grid = useMemo(() => {
    const firstOfMonth = new Date(view.getFullYear(), view.getMonth(), 1);
    const firstDayWeek = (firstOfMonth.getDay() - weekStartDay + 7) % 7;
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - firstDayWeek);
    const cells: Array<{ d: Date; iso: string; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({ d, iso: toISO(d), inMonth: d.getMonth() === view.getMonth() });
    }
    return cells;
  }, [view, weekStartDay]);

  const dayLabels = useMemo(() => {
    return [...DAY_LABELS.slice(weekStartDay), ...DAY_LABELS.slice(0, weekStartDay)];
  }, [weekStartDay]);

  const isInRange = (iso: string) => {
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-700 ${
          disabled
            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-70"
            : "border-gray-200 hover:bg-gray-50 text-gray-800"
        }`}
      >
        <span className={value ? "" : "text-gray-400"}>{value ? fmt(value) : placeholder}</span>
        <CalendarIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      </button>

      {open && !disabled && (
        <div
          role="dialog"
          aria-label="Choose date"
          onKeyDown={handlePopoverKeyDown}
          className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3"
          style={{ minWidth: 280 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              className="p-1 rounded hover:bg-gray-100">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold">
              {MONTH_LABELS[view.getMonth()]} {view.getFullYear()}
            </span>
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              className="p-1 rounded hover:bg-gray-100">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayLabels.map((l, i) => (
              <div key={i} className="text-[10px] font-semibold text-gray-400 text-center">{l}</div>
            ))}
          </div>

          {/* Date grid */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map((c) => {
              const selected = c.iso === value;
              const isToday = c.iso === todayISO;
              const allowed = isInRange(c.iso);
              return (
                <button
                  type="button"
                  key={c.iso}
                  disabled={!allowed}
                  onClick={() => { onChange(c.iso); closeAndRefocus(); }}
                  className={`text-[11px] h-7 w-7 rounded flex items-center justify-center transition-colors ${
                    !c.inMonth ? "text-gray-300" : ""
                  } ${
                    selected
                      ? "bg-accent-500 text-white font-semibold"
                      : isToday
                        ? "border border-accent-400 text-accent-700 hover:bg-accent-50"
                        : allowed
                          ? "hover:bg-gray-100 text-gray-700"
                          : "text-gray-300 cursor-not-allowed"
                  }`}
                >
                  {c.d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-[11px]">
            <button type="button" onClick={() => { onChange(todayISO); closeAndRefocus(); }}
              className="text-accent-600 hover:underline font-medium">Today</button>
            <button type="button" onClick={() => { onChange(""); closeAndRefocus(); }}
              className="text-gray-500 hover:underline">Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
