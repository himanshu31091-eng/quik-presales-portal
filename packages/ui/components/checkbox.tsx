"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/utils";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
  description?: ReactNode;
}

/**
 * Labelled checkbox primitive. For a pure <input type="checkbox"> use the
 * native element directly — this wraps it with a clickable label + optional
 * description row.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, description, className, disabled, ...rest }, ref) {
    return (
      <label
        className={cn(
          "flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className={cn(
            "mt-0.5 h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-700 focus:ring-offset-0",
            className,
          )}
          {...rest}
        />
        {(label || description) && (
          <span className="flex flex-col">
            {label && <span className="leading-tight">{label}</span>}
            {description && <span className="text-xs text-gray-500">{description}</span>}
          </span>
        )}
      </label>
    );
  },
);
