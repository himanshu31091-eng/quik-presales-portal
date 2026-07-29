"use client";

import { Trash2, X } from "lucide-react";

interface TrashBannerProps {
  count?: number;
  onExit: () => void;
}

/**
 * Sticky banner shown above a module table while the "View Trash" toggle
 * is on. Clearly signals the user is viewing soft-deleted records and
 * offers a one-click way out.
 */
export function TrashBanner({ count, onExit }: TrashBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
      <div className="flex items-center gap-2 text-amber-900">
        <Trash2 className="h-4 w-4" />
        <span className="font-semibold">Viewing deleted records</span>
        {typeof count === "number" ? (
          <span className="text-xs text-amber-700">({count})</span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onExit}
        className="flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-900 hover:underline"
      >
        <X className="h-3.5 w-3.5" />
        Exit Trash
      </button>
    </div>
  );
}
