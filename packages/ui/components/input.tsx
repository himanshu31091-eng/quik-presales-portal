"use client";

import { forwardRef, useId } from "react";
import { cn } from "../lib/utils";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  /**
   * `default` = comfortable single-form sizing (h-10 px-3)
   * `compact` = tight table-cell sizing (h-7 px-2)
   */
  size?: "default" | "compact";
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, size = "default", ...props }, ref) => {
    const sizeClasses = size === "compact"
      ? "h-7 px-2 text-xs rounded"
      : "h-10 px-3 text-sm rounded-lg";
    // Both htmlFor and id used to be the raw `id` prop. Callers overwhelmingly
    // pass `label` without an `id`, so both resolved to undefined and the label
    // was associated with nothing — every labelled Input in the app was
    // effectively unlabelled to assistive tech (WCAG 1.3.1 / 3.3.2 / 4.1.2).
    // Caught by axe, missed by manual review.
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--color-text-primary)]"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          className={cn(
            `flex w-full border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500`,
            sizeClasses,
            error && "border-[var(--color-danger)] focus:ring-[var(--color-danger)]",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--color-danger)]">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
