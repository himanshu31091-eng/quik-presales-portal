"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export interface DateInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  /** Accepts Date, ISO string, or null. Emits "YYYY-MM-DD" / null. */
  value?: Date | string | null;
  onChange?: (isoDate: string | null) => void;
  error?: boolean;
}

function toInputValue(v: Date | string | null | undefined): string {
  if (!v) return "";
  if (v instanceof Date) {
    if (isNaN(+v)) return "";
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    // Accept "YYYY-MM-DD" directly, trim ISO timestamps, reject junk
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    return isNaN(+d) ? "" : d.toISOString().slice(0, 10);
  }
  return "";
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ className, value, onChange, error, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="date"
        value={toInputValue(value)}
        onChange={(e) => onChange?.(e.target.value || null)}
        className={cn(
          "w-full px-3 py-1.5 text-sm border rounded-lg bg-white",
          "focus:outline-none focus:ring-1 focus:ring-accent-700",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error ? "border-red-300 focus:ring-red-400" : "border-gray-200",
          className,
        )}
        {...rest}
      />
    );
  },
);
