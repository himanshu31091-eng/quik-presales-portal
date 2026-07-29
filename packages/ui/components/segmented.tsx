"use client";

/**
 * Segmented — compact two-or-more-option toggle control.
 *
 * Used in right panels for binary/small-enum choices (YES / NO,
 * completion status, priority tiers). Matches the YES/NO control
 * in the Meeting Details mockup: equal-width buttons, outer border,
 * active option filled dark.
 *
 * Example:
 *   <Segmented
 *     value={form.yesterdayDone}
 *     onChange={v => set("yesterdayDone", v)}
 *     options={[{ value: "yes", label: "YES" }, { value: "no", label: "NO" }]}
 *   />
 */

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string = string> {
  value: T | null | undefined;
  onChange: (next: T) => void;
  options: SegmentedOption<T>[];
  /** Disable the whole control. */
  disabled?: boolean;
  className?: string;
}

export function Segmented<T extends string = string>({
  value,
  onChange,
  options,
  disabled,
  className = "",
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      className={`grid overflow-hidden rounded-lg border border-gray-200 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        const optDisabled = disabled || opt.disabled;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={optDisabled}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-2 text-xs font-semibold transition-colors ${
              i > 0 ? "border-l border-gray-200" : ""
            } ${
              active
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            } ${optDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
