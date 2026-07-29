/**
 * Shared severity theming.
 *
 * Consolidates the color + icon mapping used by alerts, broadcasts,
 * platform-wide notifications, and anything else that renders a
 * three-level severity. Keeping this in one place prevents drift where
 * "critical" is red-700 on one page and red-600 on another.
 *
 * Two helpers are exposed:
 *
 *   severityClass(level, variant)  → a Tailwind class string
 *   severityIcon(level)             → a lucide-react icon component
 *
 * Variant distinctions (what the audit called out as inconsistent):
 *   "badge" — tiny chip (bg + text only). Used inline in list rows.
 *   "card"  — banner / card body (bg + border + text). Used in detail blocks.
 */

import { Info, AlertCircle, AlertTriangle } from "lucide-react";
import type { ElementType } from "react";

export type SeverityLevel = "info" | "warning" | "critical";
export type SeverityVariant = "badge" | "card";

const BADGE: Record<SeverityLevel, string> = {
  info: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
};

const CARD: Record<SeverityLevel, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-900",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  critical: "bg-red-50 border-red-300 text-red-900",
};

const ICONS: Record<SeverityLevel, ElementType> = {
  info: Info,
  warning: AlertCircle,
  critical: AlertTriangle,
};

export function severityClass(level: SeverityLevel, variant: SeverityVariant = "badge"): string {
  return variant === "card" ? CARD[level] : BADGE[level];
}

export function severityIcon(level: SeverityLevel): ElementType {
  return ICONS[level];
}
