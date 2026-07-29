"use client";

/**
 * FiscalPeriodPicker — shared FY + Quarter dropdown.
 *
 * DB-scoped fiscal year list (driven by consumer via `years` prop, typically
 * fetched from `/api/org/fiscal-years`). Quarter toggle is always Q1–Q4;
 * quarters that have no QuarterSetting row for the current year can be
 * disabled via `configured`.
 *
 * Consumers:
 *   - KPI (individual + teams), Priority, Dashboard list pages
 *   - Modals (KPIModal, LogModal, PriorityModal, PriorityLogModal)
 *   - OPSP picker
 *
 * Intentionally presentational: no fetch inside. Keep it usable in any app.
 */
import { useEffect, useRef, useState } from "react";

export type FiscalQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface FiscalPeriodPickerProps {
  /** Available fiscal years (most-recent first). Pass from /api/org/fiscal-years. */
  years: number[];
  /** Currently selected fiscal year (numeric start year, e.g. 2026 = FY 2026–2027). */
  year: number;
  /** Currently selected quarter. */
  quarter: FiscalQuarter;
  /** Configured (year, quarter) pairs. Quarters outside this set are disabled. Optional. */
  configured?: Array<{ year: number; quarter: string }>;
  /** Change handler — fires when either year or quarter changes. */
  onChange: (next: { year: number; quarter: FiscalQuarter }) => void;
  /** Close the popover on quarter select. Default: true. */
  closeOnQuarterSelect?: boolean;
  /** Label renderer for the FY number. Default: `${year}–${year + 1}`. */
  formatYear?: (year: number) => string;
  /** Extra class for the trigger button. */
  className?: string;
  /** Disable the trigger entirely. */
  disabled?: boolean;
}

const QUARTERS: FiscalQuarter[] = ["Q1", "Q2", "Q3", "Q4"];

function defaultFormatYear(y: number): string {
  return `${y}–${y + 1}`;
}

export function FiscalPeriodPicker({
  years,
  year,
  quarter,
  configured,
  onChange,
  closeOnQuarterSelect = true,
  formatYear = defaultFormatYear,
  className = "",
  disabled = false,
}: FiscalPeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Ensure selected year is visible even if the DB-scoped list is empty / out of sync
  const displayYears = years.length ? years : [year];

  function quarterDisabled(q: FiscalQuarter): boolean {
    if (!configured?.length) return false;
    return !configured.some(c => c.year === year && c.quarter === q);
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md transition-colors ${
          disabled ? "border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50"
          : open ? "border-accent-300 bg-accent-50 text-accent-600"
          : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {formatYear(year)} · {quarter}
        <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiscal Year</p>
            {displayYears.length === 0 ? (
              <p className="text-[11px] text-gray-500 italic">No fiscal years configured.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1">
                {displayYears.map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => onChange({ year: y, quarter })}
                    className={`text-xs px-3 py-1.5 rounded-lg text-left transition-colors ${
                      year === y ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    {formatYear(y)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
            <div className="grid grid-cols-4 gap-1">
              {QUARTERS.map(q => {
                const dis = quarterDisabled(q);
                return (
                  <button
                    key={q}
                    type="button"
                    disabled={dis}
                    title={dis ? "Not configured for this fiscal year" : undefined}
                    onClick={() => {
                      onChange({ year, quarter: q });
                      if (closeOnQuarterSelect) setOpen(false);
                    }}
                    className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      dis ? "bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100"
                      : quarter === q ? "bg-gray-900 text-white"
                      : "hover:bg-gray-50 text-gray-700 border border-gray-200"
                    }`}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
