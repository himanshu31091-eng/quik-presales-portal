"use client";

import { useEffect, useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { cn } from "../lib/utils";

export interface ManageColumn {
  key: string;
  label: string;
}

interface ManageColsModalProps {
  open: boolean;
  onClose: () => void;
  columns: ManageColumn[];
  hiddenCols: string[];
  onChange: (nextHidden: string[]) => void;
}

/**
 * Manage Columns — canonical UI for showing/hiding table columns.
 *
 * Tabbed layout:
 *   ┌──────────────────────────────┐
 *   │ Visible Columns (26) │ Hidden Columns (1) │
 *   ├──────────────────────────────┤
 *   │ • Owner            Hide ↓    │
 *   │ • KPI Name         Hide ↓    │
 *   │ ...                          │
 *   └──────────────────────────────┘
 *
 * The active tab filters the column list. Clicking a row toggles its
 * visibility — the row physically moves to the OTHER tab on the next
 * render. The "draft" state lives in `local`; commits to the parent only
 * fire on Apply (Cancel discards).
 *
 * Visual spec:
 *   visible → accent color (theme-driven)
 *   hidden  → grey (NOT red — red reads as error)
 */
export function ManageColsModal({
  open,
  onClose,
  columns,
  hiddenCols,
  onChange,
}: ManageColsModalProps) {
  const [local, setLocal] = useState<string[]>(hiddenCols);
  const [tab, setTab] = useState<"visible" | "hidden">("visible");

  useEffect(() => {
    setLocal(hiddenCols);
    // Reset to Visible tab when the modal opens so the user always starts
    // from the same place regardless of what they did last time.
    if (open) setTab("visible");
  }, [hiddenCols, open]);

  if (!open) return null;

  const isHidden = (k: string) => local.includes(k);
  const toggle = (k: string) => {
    setLocal((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  const apply = () => {
    onChange(local);
    onClose();
  };

  const visibleList = columns.filter((c) => !isHidden(c.key));
  const hiddenList = columns.filter((c) => isHidden(c.key));
  const list = tab === "visible" ? visibleList : hiddenList;

  return (
    // z-[200] sits above the app header (z-[100]) so the dim backdrop fully
    // covers the page chrome — matches the LogModal / RightPanel pattern.
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Manage Columns</h3>
            <p className="text-xs text-gray-500">
              {visibleList.length} of {columns.length} columns visible
            </p>
            {/* Row controls (checkbox / log icon / row ID) are intentionally
                always visible — they're UI affordances, not data — so they
                don't appear here and aren't counted above. */}
            <p className="text-[10px] text-gray-400 mt-0.5">
              Row controls (#, log, checkbox) are always visible.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5" role="tablist">
          <TabButton
            active={tab === "visible"}
            onClick={() => setTab("visible")}
            label="Visible Columns"
            count={visibleList.length}
          />
          <TabButton
            active={tab === "hidden"}
            onClick={() => setTab("hidden")}
            label="Hidden Columns"
            count={hiddenList.length}
          />
        </div>

        {/* Column list — filtered by the active tab. Clicking a row toggles
            visibility, which physically moves the row to the other tab on
            the next render. */}
        <div className="flex-1 overflow-y-auto py-1 min-h-[120px]">
          {list.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-400">
              {tab === "visible"
                ? "No columns visible. Switch to the Hidden tab to restore some."
                : "No hidden columns. Switch to the Visible tab to hide some."}
            </div>
          ) : (
            list.map((c) => {
              const hidden = isHidden(c.key);
              const actionLabel = hidden ? "Show" : "Hide";
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggle(c.key)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-5 py-2 hover:bg-gray-50 transition-colors",
                    hidden ? "text-gray-500" : "text-accent-700",
                  )}
                  aria-label={`${actionLabel} ${c.label}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {hidden ? (
                      <EyeOff className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 text-accent-600" />
                    )}
                    {c.label}
                  </span>
                  {/* Action chip — shows what clicking does, not current state
                      (the tab itself communicates state). */}
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                      hidden
                        ? "bg-accent-100 text-accent-700"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {actionLabel}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/** Single tab button used in the Manage Columns header. */
function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative px-3 py-2.5 text-xs font-medium transition-colors",
        active ? "text-gray-900" : "text-gray-400 hover:text-gray-600",
      )}
    >
      {label}
      <span
        className={cn(
          "ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
          active ? "bg-accent-100 text-accent-700" : "bg-gray-100 text-gray-500",
        )}
      >
        {count}
      </span>
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-600 rounded-t" />
      )}
    </button>
  );
}
