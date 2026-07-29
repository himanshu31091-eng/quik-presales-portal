"use client";

/**
 * Super Admin → App Feature Flags → [appSlug]
 *
 * One app's module tree with per-tenant toggles. Tenant picker at the top;
 * switching tenant re-fetches the disabled set. Toggling a module POSTs to
 * /api/super/feature-flags/[appSlug]/toggle with optimistic UI.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ToggleRight, AlertCircle } from "lucide-react";
import { ModuleTree, TenantPicker, type TenantOption } from "@quikit/ui";
import { getAppConfig } from "@quikit/shared/moduleRegistry";

const APP_LABELS: Record<string, string> = {
  quikscale: "QuikScale",
  quikinfra: "QuikInfra",
  admin: "Admin Portal",
};

export default function AppFeatureFlagsPage() {
  const params = useParams();
  const appSlug = params.appSlug as string;

  // Tenant list (for the picker)
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);

  // Selected tenant + its disabled-set
  const [orgId, setOrgId] = useState<string | null>(null);
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(new Set());
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);

  const appConfig = useMemo(() => getAppConfig(appSlug), [appSlug]);

  /* Fetch tenants on mount */
  useEffect(() => {
    let cancelled = false;
    setLoadingTenants(true);
    // Large limit to avoid pagination pain in the picker for now; server
    // already supports search, we can switch to server-side filter later.
    // NOTE: the param is `limit` (parsePaginationParams reads `limit`, not
    // `pageSize`); 100 is the server's MAX_LIMIT cap.
    fetch("/api/super/orgs?page=1&limit=100")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.success) {
          setTenants(
            (j.data ?? []).map((t: { id: string; name: string; slug: string; plan?: string }) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
              plan: t.plan,
            })),
          );
        }
      })
      .finally(() => !cancelled && setLoadingTenants(false));
    return () => { cancelled = true; };
  }, []);

  /* Re-fetch disabled-set whenever the selected tenant changes */
  const loadFlags = useCallback(async (tid: string) => {
    setLoadingFlags(true);
    setSaveError(null);
    try {
      const r = await fetch(
        `/api/super/feature-flags/${appSlug}?orgId=${encodeURIComponent(tid)}`,
      );
      const j = await r.json();
      if (j.success) {
        setDisabledKeys(new Set<string>(j.data.disabledKeys));
      } else {
        setSaveError(j.error || "Failed to load flags");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoadingFlags(false);
    }
  }, [appSlug]);

  useEffect(() => {
    if (orgId) loadFlags(orgId);
    else setDisabledKeys(new Set());
  }, [orgId, loadFlags]);

  /* Toggle — optimistic: update local state, call API, roll back on error */
  const handleToggle = useCallback(async (moduleKey: string, nextEnabled: boolean) => {
    if (!orgId) return;
    setPendingKeys((p) => { const n = new Set(p); n.add(moduleKey); return n; });
    // Optimistic update
    setDisabledKeys((prev) => {
      const next = new Set(prev);
      if (nextEnabled) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
    setSaveError(null);
    try {
      const r = await fetch(`/api/super/feature-flags/${appSlug}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, moduleKey, enabled: nextEnabled }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        throw new Error(j.error || "Save failed");
      }
    } catch (err) {
      // Roll back optimistic update
      setDisabledKeys((prev) => {
        const next = new Set(prev);
        if (nextEnabled) next.add(moduleKey);
        else next.delete(moduleKey);
        return next;
      });
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPendingKeys((p) => { const n = new Set(p); n.delete(moduleKey); return n; });
    }
  }, [appSlug, orgId]);

  if (!appConfig) {
    return (
      <div className="p-6">
        <Link href="/feature-flags" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> App Feature Flags
        </Link>
        <div className="text-sm text-gray-400 py-12 text-center">Unknown app: {appSlug}</div>
      </div>
    );
  }

  const selectedOrg = tenants.find((t) => t.id === orgId);

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/feature-flags" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> App Feature Flags
      </Link>

      {/* Title */}
      <div className="flex items-center gap-2 mb-5">
        <ToggleRight className="h-5 w-5 text-accent-600" />
        <h1 className="text-xl font-bold text-gray-900">
          {APP_LABELS[appSlug] ?? appSlug}
        </h1>
      </div>

      {/* Tenant picker */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
          Configuring for tenant
        </label>
        <TenantPicker
          tenants={tenants}
          value={orgId}
          onChange={setOrgId}
          loading={loadingTenants}
          placeholder={loadingTenants ? "Loading tenants…" : "Pick a tenant to configure…"}
        />
      </div>

      {/* Save error banner */}
      {saveError && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>{saveError}</div>
        </div>
      )}

      {/* Module tree (empty state until tenant is selected) */}
      {!orgId && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
          Select a tenant above to view its module toggles. Absent toggles mean
          the module is enabled by default.
        </div>
      )}

      {orgId && loadingFlags && (
        <div className="text-sm text-gray-400 py-6 text-center">Loading flags…</div>
      )}

      {orgId && !loadingFlags && (
        <>
          <div className="mb-3 text-xs text-gray-500">
            Showing {appConfig.modules.length} modules for{" "}
            <span className="font-medium text-gray-700">{selectedOrg?.name}</span>.{" "}
            {disabledKeys.size === 0 ? (
              <span className="text-green-700">All enabled.</span>
            ) : (
              <span className="text-amber-700">
                {disabledKeys.size} disabled.
              </span>
            )}
          </div>
          <ModuleTree
            app={appConfig}
            disabledKeys={disabledKeys}
            onToggle={handleToggle}
            pendingKeys={pendingKeys}
          />
        </>
      )}
    </div>
  );
}
