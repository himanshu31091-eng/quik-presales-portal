"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download } from "lucide-react";
import { cn } from "../lib/utils";

export interface ExportColumn {
  key: string;
  label: string;
}

export type ExportRowScope = "page" | "filtered" | "all";

export interface ExportSelection {
  columnKeys: string[];
  rowScope: ExportRowScope;
}

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  columns: ExportColumn[];
  // Columns to check by default (usually = currently-visible columns)
  defaultCheckedKeys: string[];
  // Row counts for each scope (shown inline with the radio labels)
  rowCounts: { page: number; filtered: number; all: number };
  onExport: (sel: ExportSelection) => Promise<void> | void;
  // When true, row scope is forced to "filtered" and label says "Deleted (N)"
  isTrashActive?: boolean;
}

/**
 * Export Data modal — user picks columns + row scope, then fires export.
 * Visible columns checked by default; user can toggle any, flip bulk.
 */
export function ExportModal({
  open,
  onClose,
  title = "Export Data",
  columns,
  defaultCheckedKeys,
  rowCounts,
  onExport,
  isTrashActive,
}: ExportModalProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set(defaultCheckedKeys));
  const [scope, setScope] = useState<ExportRowScope>(
    isTrashActive ? "filtered" : "filtered",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setChecked(new Set(defaultCheckedKeys));
      setScope("filtered");
    }
  }, [open, defaultCheckedKeys]);

  if (!open || typeof document === "undefined") return null;

  const toggle = (k: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const selectAll = () => setChecked(new Set(columns.map((c) => c.key)));
  const clearAll = () => setChecked(new Set());

  const go = async () => {
    if (checked.size === 0) return;
    setBusy(true);
    try {
      await onExport({
        columnKeys: columns.filter((c) => checked.has(c.key)).map((c) => c.key),
        rowScope: scope,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    // Portaled to <body> at z-[1000] so it always covers the dashboard header
    // (which owns a z-[100] stacking context) regardless of where in the page
    // tree the trigger is mounted.
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">
              Choose columns and which rows to include.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Row scope */}
          <div className="px-5 py-3 border-b border-gray-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Rows
            </div>
            {isTrashActive ? (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                Trash view is active — exporting{" "}
                <strong>deleted records only</strong> ({rowCounts.filtered}).
              </div>
            ) : (
              <div className="space-y-1.5">
                {([
                  ["page", `Current page (${rowCounts.page})`],
                  ["filtered", `All filtered rows (${rowCounts.filtered})`],
                  ["all", `All rows, ignoring filters (${rowCounts.all})`],
                ] as const).map(([val, label]) => (
                  <label
                    key={val}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="row-scope"
                      checked={scope === val}
                      onChange={() => setScope(val)}
                      className="accent-[var(--accent-600,#0066cc)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Columns */}
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Columns ({checked.size}/{columns.length})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-accent-700 hover:text-accent-800 font-medium"
                >
                  Select all
                </button>
                <span className="text-gray-300 text-xs">·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {columns.map((c) => {
                const on = checked.has(c.key);
                return (
                  <label
                    key={c.key}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border text-sm",
                      on
                        ? "border-accent-300 bg-accent-50 text-accent-800"
                        : "border-gray-200 bg-white text-gray-500",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(c.key)}
                      className="accent-[var(--accent-600,#0066cc)]"
                    />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy || checked.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {busy ? "Exporting…" : "Export .xlsx"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
