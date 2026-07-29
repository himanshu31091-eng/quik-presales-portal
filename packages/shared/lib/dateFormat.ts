/**
 * Standardized date formatting helper.
 *
 * One function, multiple output styles. Used so every surface of the app
 * renders dates consistently — "Mar 14, 2026" on a settings page and
 * "Mar 14, 2026 3:45 PM" on an audit log entry come from the same helper.
 *
 * Usage:
 *
 *   import { formatDate } from "@quikit/shared/dateFormat";
 *   formatDate(invoice.createdAt)              // default "short"
 *   formatDate(invoice.createdAt, "datetime")
 *   formatDate(invoice.createdAt, "relative")
 *   formatDate(invoice.createdAt, "long")
 *   formatDate(invoice.createdAt, "iso")       // YYYY-MM-DD (stable; good for input[type=date])
 *
 * All styles accept `Date` or an ISO-8601 string. Returns "" for invalid
 * or missing input so call sites don't have to null-check before rendering.
 *
 * This file intentionally has ZERO dependencies — no date-fns, no luxon.
 * The 5 styles below are expressible with Intl.DateTimeFormat + a small
 * computation for "relative". That keeps @quikit/shared free of peer-dep
 * bloat and usable from any runtime (node, edge, browser).
 */

export type DateStyle = "short" | "long" | "datetime" | "relative" | "iso";

export function formatDate(
  input: Date | string | number | null | undefined,
  style: DateStyle = "short",
): string {
  if (input === null || input === undefined || input === "") return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";

  switch (style) {
    case "short":
      // "Mar 14, 2026"
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    case "long":
      // "March 14, 2026"
      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    case "datetime":
      // "Mar 14, 2026, 3:45 PM"
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

    case "relative":
      return formatRelative(d);

    case "iso":
      // Safe for input[type=date] binding: YYYY-MM-DD (local timezone).
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    default: {
      // Exhaustiveness check — unreachable but kept so future style additions
      // are caught at compile time if someone forgets a case.
      const _never: never = style;
      return String(_never);
    }
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatRelative(d: Date): string {
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  const abs = Math.abs(diffSec);

  // Future dates use "in X" phrasing
  const future = diffSec < 0;
  const prefix = future ? "in " : "";
  const suffix = future ? "" : " ago";

  if (abs < 45) return future ? "in a few seconds" : "just now";
  if (abs < 90) return `${prefix}a minute${suffix}`;
  if (abs < 3600) return `${prefix}${Math.floor(abs / 60)}m${suffix}`;
  if (abs < 86400) return `${prefix}${Math.floor(abs / 3600)}h${suffix}`;
  if (abs < 604800) return `${prefix}${Math.floor(abs / 86400)}d${suffix}`;
  // Beyond 7 days, the absolute date is more informative than "3w ago"
  return formatDate(d, "short");
}
