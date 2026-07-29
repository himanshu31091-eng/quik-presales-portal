"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value" | "size"> {
  value?: number | string | null;
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Pattern restricts input to digits only (rejects letters on input). */
  integerOnly?: boolean;
  error?: boolean;
  /** `compact` = table-cell sizing (h-7, px-2, text-xs) */
  size?: "default" | "compact";
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ className, onChange, value, integerOnly, error, size = "default", ...rest }, ref) {
    const sizeClasses = size === "compact"
      ? "h-7 px-2 text-xs rounded"
      : "px-3 py-1.5 text-sm rounded-lg";
    return (
      <input
        ref={ref}
        type="number"
        inputMode={integerOnly ? "numeric" : "decimal"}
        step={integerOnly ? 1 : rest.step ?? "any"}
        value={value ?? ""}
        onChange={(e) => {
          if (!onChange) return;
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = integerOnly ? parseInt(raw, 10) : parseFloat(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
        className={cn(
          "w-full border bg-white",
          sizeClasses,
          "focus:outline-none focus:ring-1 focus:ring-accent-400",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error ? "border-red-300 focus:ring-red-400" : "border-gray-200",
          className,
        )}
        {...rest}
      />
    );
  },
);
