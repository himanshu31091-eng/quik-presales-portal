"use client";

import { type ReactNode } from "react";
import { cn } from "../lib/utils";

export interface TabsProps {
  /** Active tab key. */
  value: string;
  onChange: (key: string) => void;
  items: Array<{ key: string; label: ReactNode; icon?: React.ComponentType<{ className?: string }>; badge?: ReactNode; disabled?: boolean }>;
  className?: string;
}

/**
 * Underline-style tabs — matches QuikScale's dashboard tab pattern.
 * Active indicator uses accent-600. Use with any controlled state.
 */
export function Tabs({ value, onChange, items, className }: TabsProps) {
  return (
    <div className={cn("flex overflow-x-auto border-b border-gray-200", className)}>
      {items.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => !t.disabled && onChange(t.key)}
            disabled={t.disabled}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors",
              active
                ? "border-accent-600 text-accent-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
              t.disabled && "opacity-50 cursor-not-allowed hover:text-gray-500 hover:border-transparent",
            )}
          >
            {t.icon ? <t.icon className="h-3.5 w-3.5" /> : null}
            {t.label}
            {t.badge !== undefined && (
              <span className="ml-1 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
