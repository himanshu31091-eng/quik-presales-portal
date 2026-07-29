"use client";

/**
 * RightPanel — standard right-docked slide panel used by every module's
 * create/edit/log flow (KPI, Priority, WWW, Meeting, OPSP, Org-setup).
 *
 * Spec derived from the Meeting Details mockup — see CLAUDE.md §right-panel
 * design tokens. Built intentionally separate from the existing <SlidePanel>
 * primitive so the older, slightly different look can be retired without
 * breaking every consumer in a single pass.
 *
 * Composition:
 *   <RightPanel open onClose size title subtitle tabs activeTab onTabChange footer>
 *     <RightPanel.Section>…</RightPanel.Section>
 *   </RightPanel>
 *
 *   <RightPanelFooter>
 *     <RightPanelCancelButton … />
 *     <RightPanelSubmitButton … />
 *   </RightPanelFooter>
 *
 * Every child of <RightPanel> is rendered inside a vertically-scrolling body
 * with consistent 24px horizontal padding and 20px section spacing.
 */

import { useEffect, type ReactNode } from "react";
import { X, Plus, Check } from "lucide-react";

export type RightPanelSize = "sm" | "md" | "lg";

const SIZE_WIDTH: Record<RightPanelSize, string> = {
  sm: "w-full sm:w-[520px]",
  md: "w-full sm:w-[620px]",
  lg: "w-full sm:w-[760px]",
};

export interface RightPanelTab {
  key: string;
  label: string;
}

export interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Subtitle line — e.g. "Create new record", "Due Apr 12 · Ashwin Singh". */
  subtitle?: ReactNode;
  size?: RightPanelSize;
  /** Optional tab bar rendered under the header. */
  tabs?: RightPanelTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** Footer content — usually RightPanelFooter with Cancel + Submit. */
  footer?: ReactNode;
  children: ReactNode;
}

export function RightPanel({
  open,
  onClose,
  title,
  subtitle,
  size = "sm",
  tabs,
  activeTab,
  onTabChange,
  footer,
  children,
}: RightPanelProps) {
  // Lock body scroll while the panel is open so the sheet doesn't scroll the
  // page behind it (matches the mockup's modal-like feel).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative ml-auto h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col ${SIZE_WIDTH[size]} sm:max-w-[95vw]`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h2>
            {subtitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-200 flex-shrink-0 transition-colors"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        {tabs && tabs.length > 1 && (
          <div className="flex gap-0 px-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => onTabChange?.(t.key)}
                className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === t.key
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                }`}
              >
                {t.label}
                {activeTab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-gray-100 rounded-t" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body — scrolls vertically, fixed horizontal padding + section gap.
            `scrollbar-visible` opts back IN to a visible scrollbar (the app
            hides scrollbars globally), so on short screens (13" laptops) users
            get a clear visual cue that the form scrolls. */}
        <div className="scrollbar-visible flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Default footer layout — Cancel on the left, Submit on the right.
 *
 * Passing children directly to <RightPanel footer> is supported for
 * custom footers (e.g. destructive actions). For the standard flow
 * use <RightPanelFooter>…</RightPanelFooter>.
 */
export function RightPanelFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 w-full">{children}</div>;
}

export interface RightPanelCancelButtonProps {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}

export function RightPanelCancelButton({ onClick, label = "Cancel", disabled }: RightPanelCancelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
    >
      <X className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export interface RightPanelSubmitButtonProps {
  onClick: () => void;
  label: string;
  /** Leading icon. Defaults to `Plus` for create, `Check` for edit. */
  icon?: "plus" | "check" | "none";
  saving?: boolean;
  disabled?: boolean;
  title?: string;
}

export function RightPanelSubmitButton({
  onClick,
  label,
  icon = "plus",
  saving,
  disabled,
  title,
}: RightPanelSubmitButtonProps) {
  const Icon = icon === "plus" ? Plus : icon === "check" ? Check : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      title={title}
      className="flex items-center gap-1.5 px-5 py-2 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {saving ? (
        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5" />
      ) : null}
      {label}
    </button>
  );
}
