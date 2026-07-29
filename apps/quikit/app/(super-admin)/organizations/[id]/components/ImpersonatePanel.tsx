"use client";

/**
 * SA-D.6 — "View as" panel on tenant detail.
 *
 * Lists the tenant's admins, lets the super admin pick one + an app + an
 * optional reason, then triggers the impersonation flow (opens the accept
 * URL in a new tab so the super admin keeps their own session here).
 */

import { useEffect, useState } from "react";
import { Eye, AlertTriangle, ExternalLink } from "lucide-react";

interface Member {
  id: string;
  role: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface App {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  status: string;
}

export function ImpersonatePanel({ orgId, members }: { orgId: string; members: Member[] }) {
  const [apps, setApps] = useState<App[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetAppSlug, setTargetAppSlug] = useState("");
  const [reason, setReason] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/super/apps")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const usable = (j.data as App[]).filter(
            (a) =>
              a.status === "active" &&
              a.baseUrl.startsWith("http") &&
              a.slug !== "quikit", // can't impersonate into the launcher
          );
          setApps(usable);
          if (usable.length === 1) setTargetAppSlug(usable[0].slug);
        }
      })
      .catch(() => {});
  }, []);

  // Filter to impersonatable members (admins + team heads only — no super admins).
  const candidates = members.filter((m) => m.role !== "viewer");

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/super/impersonate/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          targetOrgId: orgId,
          targetAppSlug,
          reason: reason.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed to start impersonation");
        return;
      }
      // Open in a new tab so the super admin retains their session here.
      window.open(j.data.redirectUrl, "_blank", "noopener,noreferrer");
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
      <header className="px-5 py-4 border-b border-amber-200/60 flex items-center gap-3">
        <Eye className="h-5 w-5 text-amber-700" />
        <div>
          <h2 className="font-semibold text-gray-900">View as organization user</h2>
          <p className="text-xs text-gray-600">
            Opens the target app signed in as this user. Every action is audited. Session expires after 2 hours.
          </p>
        </div>
      </header>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">User</span>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a user...</option>
              {candidates.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.firstName} {m.user.lastName} — {m.user.email} ({m.role})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Target app</span>
            <select
              value={targetAppSlug}
              onChange={(e) => setTargetAppSlug(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">Select an app...</option>
              {apps.map((a) => (
                <option key={a.id} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1">Reason (optional, logged)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. debug ticket #1234 — KPI table display issue"
            maxLength={500}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2">
          <p className="text-xs text-gray-500">
            You&apos;ll open in a new tab. Close it or click &quot;Exit impersonation&quot; to end the session.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={!targetUserId || !targetAppSlug || starting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {starting ? "Starting..." : "View as"}
          </button>
        </div>
      </div>
    </section>
  );
}
