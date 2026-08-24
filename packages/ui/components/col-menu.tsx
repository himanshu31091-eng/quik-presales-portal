"use client";

import { useState, useRef, useEffect } from "react";

interface ColMenuProps {
  colKey: string;
  onSort?: (dir: "asc" | "desc") => void;
  onFreeze?: () => void;
  onHide?: () => void;
  frozen?: boolean;
  showSort?: boolean;
  showFreeze?: boolean;
  showHide?: boolean;
  /** Current sort direction for THIS column, or null when it isn't the active
   *  sort. Drives the ✓ marker + reveals the "Clear sort" row. */
  activeSort?: "asc" | "desc" | null;
  /** Reset sorting back to the list's default order (newest first). Only
   *  rendered when the column is actively sorted. */
  onClearSort?: () => void;
}

/**
 * Shared table column menu -- three-dot menu with sort, freeze, and hide options.
 *
 * Sort UX: both directions are always listed. When this column is the active
 * sort (`activeSort` set), the matching direction shows a ✓, clicking it again
 * clears the sort, and a dedicated "Clear sort" row appears so returning to the
 * default (newest-first) order is discoverable.
 */
export function ColMenu({
  colKey,
  onSort,
  onFreeze,
  onHide,
  frozen = false,
  showSort = true,
  showFreeze = true,
  showHide = true,
  activeSort = null,
  onClearSort,
}: ColMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        title={`Column options: ${colKey}`}
        // Icon-only trigger: `title` alone is not a dependable accessible name.
        // focus-visible:opacity-100 above also keeps it from being invisible to
        // keyboard users, since it only faded in on group hover.
        aria-label={`Column options: ${colKey}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 text-xs">
          {showSort && onSort && (
            <>
              <button
                onClick={() => {
                  // Clicking the already-active direction clears the sort;
                  // otherwise apply ascending.
                  if (activeSort === "asc" && onClearSort) onClearSort();
                  else onSort("asc");
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-50 text-gray-700"
              >
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                <span className="flex-1 text-left">Sort Ascending</span>
                {activeSort === "asc" && (
                  <svg className="h-3.5 w-3.5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => {
                  if (activeSort === "desc" && onClearSort) onClearSort();
                  else onSort("desc");
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-50 text-gray-700"
              >
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="flex-1 text-left">Sort Descending</span>
                {activeSort === "desc" && (
                  <svg className="h-3.5 w-3.5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              {activeSort && onClearSort && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    onClick={() => { onClearSort(); setOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                  >
                    <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear sort
                  </button>
                </>
              )}
            </>
          )}
          {showFreeze && onFreeze && (
            <button
              onClick={() => { onFreeze(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-50 text-gray-700"
            >
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {frozen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 018 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                )}
              </svg>
              {frozen ? "Unfreeze Column" : "Freeze Column"}
            </button>
          )}
          {showHide && onHide && (
            <button
              onClick={() => { onHide(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-50 text-gray-700"
            >
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
              Hide
            </button>
          )}
        </div>
      )}
    </div>
  );
}
