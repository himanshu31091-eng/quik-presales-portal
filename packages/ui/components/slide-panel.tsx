"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Width presets for different form complexities:
 *   - default (480px): simple single-column master forms (Customer, Vendor, Employee…)
 *   - lg (720px): forms with 2-column grids and some compact line items (Receipt, Payment, Expense, Credit/Debit Notes)
 *   - xl (1080px): multi-line document forms with wide tables (BOQ, RAB, PR, PO, GRN, Issue, Estimation, WorkOrder)
 *   - full (100vw up to 1400px): very wide tables (BOQ import preview, Attendance bulk editor)
 */
type SlidePanelSize = "default" | "lg" | "xl" | "full";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: SlidePanelSize;
}

const SIZE_CLASS: Record<SlidePanelSize, string> = {
  default: "sm:w-[480px]",
  lg: "sm:w-[720px]",
  xl: "sm:w-[1080px]",
  full: "sm:w-[1400px]",
};

export function SlidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "default",
}: SlidePanelProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      {/* Backdrop (mobile: absolute behind; sm+: flex sibling that pushes panel right) */}
      <div
        className="absolute inset-0 bg-black/30 sm:static sm:flex-1"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className={`relative z-10 ml-auto w-full ${SIZE_CLASS[size]} sm:max-w-[95vw] bg-white shadow-2xl flex flex-col`}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
