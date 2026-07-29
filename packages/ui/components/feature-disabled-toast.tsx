"use client";

/**
 * Renders a dismissable toast when the URL has `?feature_disabled=<moduleKey>`.
 * Mounted on the dashboard layout so any module-gate redirect (from
 * gateModuleRoute in packages/auth/feature-gate) surfaces a human-readable
 * explanation when the user lands on /dashboard.
 *
 * Pure client component. Reads the query param, auto-dismisses after 6s,
 * and removes the param from the URL on dismiss so a refresh doesn't
 * re-show it.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { AlertCircle, X } from "lucide-react";

/** Friendly labels for the most-often disabled modules. Fallback = the key. */
const MODULE_LABELS: Record<string, string> = {
  kpi: "KPI",
  "kpi.teams": "Team KPI",
  "kpi.individual": "Individual KPI",
  priority: "Priority",
  orgSetup: "Org Setup",
  "orgSetup.teams": "Teams",
  "orgSetup.users": "Users",
  "orgSetup.quarters": "Quarter Settings",
  www: "WWW",
  clientMeetings: "Meeting Rhythm",
  "clientMeetings.dashboard": "Client Meetings Dashboard",
  "clientMeetings.clients": "Client Master",
  "clientMeetings.members": "Client Members",
  "clientMeetings.dailyHuddle": "Daily Huddle",
  "clientMeetings.weeklyMeeting": "Weekly Meeting",
  opsp: "OPSP",
  "opsp.review": "OPSP Review",
  "opsp.history": "OPSP History",
  "opsp.categories": "Category Management",
  analytics: "Analytics",
  people: "People",
};

function labelFor(key: string): string {
  return MODULE_LABELS[key] ?? key;
}

export function FeatureDisabledToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const key = searchParams.get("feature_disabled");
  const [visible, setVisible] = useState(Boolean(key));

  useEffect(() => {
    setVisible(Boolean(key));
  }, [key]);

  // Auto-dismiss after 6s
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => dismiss(), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    setVisible(false);
    // Strip the query param so a reload doesn't re-fire the toast.
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete("feature_disabled");
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname);
  }

  if (!visible || !key) return null;

  return (
    <div
      role="alert"
      className="fixed top-4 right-4 z-[9999] max-w-sm bg-white rounded-xl border border-amber-200 shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-top-4 fade-in duration-200"
    >
      <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">
          {labelFor(key)} is disabled
        </p>
        <p className="text-xs text-gray-600 mt-0.5">
          This module is disabled for your organization. Contact your admin to re-enable it.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="text-gray-400 hover:text-gray-600 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
