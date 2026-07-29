"use client";

/**
 * SA-B.6 — BroadcastBanner
 *
 * DISABLED 2026-04-20: returns null unconditionally. Broadcasts feature
 * parked until there's real demand; the component was polling
 * /api/broadcasts/active every 5 min on every authenticated tab for
 * zero business value right now (no active broadcasts in the system).
 * Left the component exported + typed so call-sites don't need updates;
 * re-enable by restoring the original implementation from git history.
 *
 * Full implementation (fetch, setInterval, render, dismiss) is retained
 * below in a commented block for quick restoration.
 *
 * Original doc:
 *   Renders active platform announcements at the top of an app. Fetches
 *   from /api/broadcasts/active?app=<slug>, stacks multiple banners, and
 *   calls /api/broadcasts/<id>/dismiss when the user closes one.
 */

export interface BroadcastBannerProps {
  /** App slug for targeting (empty = platform-wide only) */
  appSlug: string;
  /** Override the fetch base URL — defaults to same origin. */
  baseUrl?: string;
  className?: string;
}

// Accept all props to preserve the public API; swallow via void so lint
// doesn't flag them as unused while the component is paused.
export function BroadcastBanner(props: BroadcastBannerProps) {
  void props;
  return null;
}

/* ----- ORIGINAL IMPLEMENTATION (paused 2026-04-20) -----

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";

interface ActiveBroadcast {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  startsAt: string;
  endsAt: string | null;
}

const severityStyles: Record<string, { bg: string; icon: typeof Info }> = {
  info: { bg: "bg-blue-50 border-blue-200 text-blue-900", icon: Info },
  warning: { bg: "bg-amber-50 border-amber-200 text-amber-900", icon: AlertCircle },
  critical: { bg: "bg-red-50 border-red-300 text-red-900", icon: AlertTriangle },
};

export function BroadcastBanner({ appSlug, baseUrl = "", className = "" }: BroadcastBannerProps) {
  const [items, setItems] = useState<ActiveBroadcast[]>([]);

  const fetchBroadcasts = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/broadcasts/active?app=${encodeURIComponent(appSlug)}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const j = await res.json();
      if (j.success) setItems(j.data);
    } catch {
      // silent — broadcast failures must not break pages
    }
  }, [baseUrl, appSlug]);

  useEffect(() => {
    fetchBroadcasts();
    // Refresh every 5 minutes so new announcements surface without a reload.
    const interval = setInterval(fetchBroadcasts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchBroadcasts]);

  async function dismiss(id: string) {
    setItems((prev) => prev.filter((b) => b.id !== id));
    try {
      await fetch(`${baseUrl}/api/broadcasts/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // If the dismiss call fails we've already hidden it locally; it'll
      // resurface on next load but that's acceptable.
    }
  }

  if (items.length === 0) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {items.map((b) => {
        const style = severityStyles[b.severity] ?? severityStyles.info;
        const Icon = style.icon;
        return (
          <div
            key={b.id}
            role="alert"
            className={`flex items-start gap-3 border rounded-lg px-4 py-3 ${style.bg}`}
          >
            <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{b.title}</p>
              <p className="text-xs mt-0.5 opacity-90 whitespace-pre-wrap">{b.body}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(b.id)}
              className="opacity-60 hover:opacity-100 flex-shrink-0"
              aria-label="Dismiss announcement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

----- END ORIGINAL ----- */
