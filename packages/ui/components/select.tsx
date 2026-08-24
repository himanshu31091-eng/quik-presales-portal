"use client";

import React from "react";

/**
 * Shared Select component — standardized native <select> wrapper.
 *
 * Matches QuikScale's form select pattern:
 * - text-sm, border-gray-200, rounded-lg, focus:ring-1 ring-accent-400
 * - Optional label + error display
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "size"> {
  /** Optional label displayed above the select */
  label?: string;
  /** Error message displayed below the select */
  error?: string;
  /** Options to render */
  options: SelectOption[];
  /** Placeholder option (disabled, shown when no value selected) */
  placeholder?: string;
  /**
   * `default` = comfortable single-form sizing (px-3 py-2)
   * `compact` = tight table-cell sizing (px-2 py-1, smaller text)
   */
  size?: "default" | "compact";
}

const SIZE_PADDING: Record<NonNullable<SelectProps["size"]>, string> = {
  default: "px-3 py-2 text-sm rounded-lg",
  compact: "px-1.5 py-1 pr-6 text-xs rounded",
};

export function Select({
  label,
  error,
  options,
  placeholder,
  id,
  className = "",
  size = "default",
  ...props
}: SelectProps) {
  // Fallback id comes from useId, not a slugified label: two <Select label="Status">
  // on one screen (a filter bar plus an open modal, or one per table row) both
  // produced id="status", and a duplicate id binds the label to whichever element
  // comes first — leaving the rest unlabelled (WCAG 1.3.1 / 4.1.1).
  const generatedId = React.useId();
  const selectId = id || (label ? generatedId : undefined);

  return (
    <div>
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-medium text-gray-600 block mb-1.5"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full border ${SIZE_PADDING[size]} focus:outline-none focus:ring-1 bg-white transition-colors ${
          error
            ? "border-red-300 focus:ring-red-400"
            : "border-gray-200 focus:ring-accent-400"
        } ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
