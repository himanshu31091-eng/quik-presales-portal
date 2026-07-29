"use client";

import { useState, useRef, useEffect } from "react";
import { EyeOff, Eye, X } from "lucide-react";

interface HiddenColsPillProps {
  hiddenCols: string[];
  colLabels: Record<string, string>;
  onRestore: (colKey: string) => void;
  onRestoreAll?: () => void;
}

/**
 * Small pill button that shows count of hidden columns.
 * Click to open a dropdown listing them with a restore button for each.
 */
export function HiddenColsPill({ hiddenCols, colLabels, onRestore, onRestoreAll }: HiddenColsPillProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (hiddenCols.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors"
      >
        <EyeOff className="h-3.5 w-3.5 text-gray-400" />
        Hidden ({hiddenCols.length})
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 text-xs">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Hidden Columns</span>
            {onRestoreAll && hiddenCols.length > 1 && (
              <button onClick={() => { onRestoreAll(); setOpen(false); }} className="text-[10px] text-accent-600 hover:underline">
                Show all
              </button>
            )}
          </div>
          {hiddenCols.map((col) => (
            <button
              key={col}
              onClick={() => { onRestore(col); if (hiddenCols.length === 1) setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-gray-700 group"
            >
              <span className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-gray-400" />
                {colLabels[col] ?? col}
              </span>
              <X className="h-3 w-3 text-gray-300 group-hover:text-gray-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
