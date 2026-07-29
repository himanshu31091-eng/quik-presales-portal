"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Small app-local layout primitives — page headers, stat tiles, status pills,
 * table chrome.
 *
 * These are composition + Tailwind over @quikit/ui, not replacements for it.
 * Buttons, inputs, modals, tables etc. all come from @quikit/ui; nothing here
 * re-implements a shared component.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  /** ReactNode so pages can put links in the subtitle line. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-gray-500">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-gray-200 bg-white", className)}>
      {title ? (
        <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </>
  );

  const base = "rounded-lg border border-gray-200 bg-white p-4";
  return href ? (
    <Link href={href} className={cn(base, "block transition-colors hover:border-accent-300")}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

/**
 * Semantic status colours. These are data states (a "gap" requirement, a
 * "lost" deal), not brand surfaces, so they use fixed Tailwind colours rather
 * than `accent-*` — per the theming rules in the root CLAUDE.md.
 */
const PILL_TONES: Record<string, string> = {
  // Compliance
  compliant: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  gap: "bg-red-100 text-red-800",
  clarify: "bg-gray-100 text-gray-700",
  // Proposal + RFP status
  draft: "bg-gray-100 text-gray-700",
  "internal-review": "bg-blue-100 text-blue-800",
  "customer-review": "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  uploaded: "bg-gray-100 text-gray-700",
  extracting: "bg-blue-100 text-blue-800",
  extracted: "bg-indigo-100 text-indigo-800",
  responded: "bg-teal-100 text-teal-800",
  submitted: "bg-green-100 text-green-800",
  // Outcomes
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
  open: "bg-blue-100 text-blue-800",
  // Demo / template
  ready: "bg-green-100 text-green-800",
  outdated: "bg-amber-100 text-amber-800",
  final: "bg-green-100 text-green-800",
  // RAG
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  na: "bg-gray-100 text-gray-500",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        PILL_TONES[status] ?? "bg-gray-100 text-gray-700",
      )}
    >
      {label ?? status.replace(/-/g, " ")}
    </span>
  );
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-gray-400">
        {message}
      </td>
    </tr>
  );
}

export function TableShell({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap bg-accent-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-gray-400">{label}</p>;
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

/** Badge shown wherever AI output is a placeholder because no key is set. */
export function StubBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      AI stub — set ANTHROPIC_API_KEY
    </span>
  );
}
