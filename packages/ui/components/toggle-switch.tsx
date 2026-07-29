"use client";

import { cn } from "../lib/utils";

export interface ToggleSwitchProps {
  /** Current on/off state. */
  checked: boolean;
  /** Called when the toggle is clicked (user wants to flip state). */
  onChange: (next: boolean) => void;
  /** Optional label rendered on the right. */
  label?: string;
  /** Disabled toggles cannot be clicked and render muted. */
  disabled?: boolean;
  /** Shown in a tooltip / aria-label for accessibility. */
  ariaLabel?: string;
  /** Size variant. `sm` for dense list use (module tree), `md` for forms. */
  size?: "sm" | "md";
  /** Async onChange handlers may want to hold the UI in a "busy" state. */
  loading?: boolean;
  className?: string;
}

/**
 * Accessible on/off toggle switch. Small, focused, no external deps.
 *
 * Used by `<ModuleTree>` and anywhere else we need a binary control. Prefer
 * this over a checkbox when the semantic is "enable / disable a feature" —
 * checkboxes imply a form submission, toggles imply immediate effect.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  ariaLabel,
  size = "md",
  loading = false,
  className,
}: ToggleSwitchProps) {
  const isDisabled = disabled || loading;

  const trackSize =
    size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const thumbSize =
    size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const thumbTranslate =
    size === "sm"
      ? checked
        ? "translate-x-3"
        : "translate-x-0.5"
      : checked
        ? "translate-x-4"
        : "translate-x-0.5";

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 select-none",
        isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        disabled={isDisabled}
        onClick={() => !isDisabled && onChange(!checked)}
        className={cn(
          "relative inline-flex flex-shrink-0 items-center rounded-full transition-colors",
          trackSize,
          checked ? "bg-accent-600" : "bg-gray-300",
          isDisabled ? "" : "hover:brightness-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-1",
        )}
      >
        <span
          className={cn(
            "inline-block rounded-full bg-white shadow-sm transition-transform",
            thumbSize,
            thumbTranslate,
            loading && "animate-pulse",
          )}
        />
      </button>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}
