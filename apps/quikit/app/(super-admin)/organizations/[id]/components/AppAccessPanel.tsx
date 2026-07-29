"use client";

/**
 * SA-B.1 — Per-organization app access control panel.
 *
 * Each row = one registered app + a toggle that writes TenantAppAccess.
 * When a tenant is "blocked" for an app, all routes / APIs for that app
 * return 403 via the SA-A.6 hard gate.
 */

import { useState } from "react";
import { useOnceEffect } from "@/lib/hooks/useOnceEffect";
import { AppWindow, Shield } from "lucide-react";
import { ToggleSwitch, Skeleton } from "@quikit/ui";

interface AppRow {
  appId: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  appStatus: string;
  enabled: boolean;
  reason: string | null;
  updatedAt: string | null;
}

export function AppAccessPanel({ orgId }: { orgId: string }) {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [reasonModal, setReasonModal] = useState<{ appId: string; appName: string } | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/super/org-app-access/${orgId}`);
      const j = await r.json();
      if (j.success) setApps(j.data.apps);
    } finally {
      setLoading(false);
    }
  }

  useOnceEffect(() => {
    load();
  }, [orgId]);

  async function toggle(appId: string, next: boolean, reasonText?: string) {
    setPending((s) => new Set(s).add(appId));
    // optimistic
    setApps((prev) => prev.map((a) => (a.appId === appId ? { ...a, enabled: next, reason: next ? null : reasonText ?? null } : a)));
    try {
      const r = await fetch(`/api/super/org-app-access/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId, enabled: next, reason: reasonText }),
      });
      const j = await r.json();
      if (!j.success) {
        load(); // rollback by refetching
      }
    } catch {
      load();
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(appId);
        return n;
      });
    }
  }

  function handleToggleClick(row: AppRow) {
    if (row.enabled) {
      // blocking — prompt for optional reason
      setReasonModal({ appId: row.appId, appName: row.name });
      setReason("");
    } else {
      toggle(row.appId, true);
    }
  }

  async function confirmBlock() {
    if (!reasonModal) return;
    await toggle(reasonModal.appId, false, reason.trim() || undefined);
    setReasonModal(null);
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <Shield className="h-5 w-5 text-gray-500" />
        <h2 className="font-semibold text-gray-900">App access</h2>
      </header>
      {loading ? (
        <ul className="divide-y divide-gray-100">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </li>
          ))}
        </ul>
      ) : apps.length === 0 ? (
        <div className="p-5 text-gray-400 text-sm">No apps registered.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {apps.map((a) => (
            <li key={a.appId} className="flex items-center gap-3 px-5 py-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                <AppWindow className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{a.name}</p>
                <p className="text-xs text-gray-500 font-mono">{a.slug}</p>
                {!a.enabled && a.reason && (
                  <p className="text-xs text-red-600 mt-0.5">Reason: {a.reason}</p>
                )}
              </div>
              <ToggleSwitch
                checked={a.enabled}
                onChange={() => handleToggleClick(a)}
                loading={pending.has(a.appId)}
                ariaLabel={`Toggle access to ${a.name}`}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Simple inline modal for blocking reason */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setReasonModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Block {reasonModal.appName}?</h3>
            <p className="text-sm text-gray-600 mt-1">
              This tenant will lose access immediately. All routes and APIs for this app return 403.
            </p>
            <label className="block mt-4">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Reason (optional, visible to tenant)</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="e.g. trial expired, payment failed"
              />
            </label>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setReasonModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={confirmBlock} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">
                Block access
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
