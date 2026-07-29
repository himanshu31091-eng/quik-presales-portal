"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "../lib/utils";

export interface MoreMenuItem {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  disabled?: boolean;
  // Optional right-side accessory (e.g. toggle state pill)
  accessory?: React.ReactNode;
}

interface MoreMenuProps {
  items: MoreMenuItem[];
  className?: string;
}

/**
 * "More" pill — replaces the three-dot icon across module pages.
 * Styled to sit next to AddButton with the same pill shape (slightly
 * less loud — outline instead of solid accent).
 */
export function MoreMenu({ items, className }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-accent-700 bg-white border border-accent-200 hover:bg-accent-50 rounded-lg transition-colors"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
        More
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-accent-50 hover:text-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              <span className="flex items-center gap-2">
                {item.icon ? <item.icon className="h-3.5 w-3.5" /> : null}
                {item.label}
              </span>
              {item.accessory}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
