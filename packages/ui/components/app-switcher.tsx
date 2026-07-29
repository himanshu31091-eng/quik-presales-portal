"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Types ─── */
interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  baseUrl: string;
  status: string;
  installed?: boolean;
}

interface AppSwitcherProps {
  /**
   * Optional override for the API endpoint. Defaults to "/api/apps/switcher",
   * which every app in the platform is expected to expose. QuikIT's super
   * admin layout uses "/api/apps/launcher" since it serves the full registry.
   */
  apiUrl?: string;
  /**
   * Disable the idle-time prefetch on mount. Default: prefetch enabled.
   * Set to false in test environments where the fetch would make noise.
   */
  prefetch?: boolean;
}

/* ─── Module-level cache ─────────────────────────────────────────────────── */

/**
 * The app list is hoisted to a module-level cache with a 5-min TTL so:
 *   - Re-mounts of the switcher (e.g. route transitions that remount the
 *     header, OAuth round-trips that re-hydrate the app shell) do NOT
 *     refetch — the first GET /api/apps/switcher on the page is the only
 *     one that hits the network for the next 5 minutes.
 *   - Multiple AppSwitcher instances in the same tab share one cached
 *     response keyed by apiUrl (launcher vs switcher).
 *
 * Paired with the idle-time prefetch below, this means the FIRST open of
 * the switcher is instant on the vast majority of navigations.
 */
interface CacheEntry {
  apps: AppInfo[];
  quikitUrl: string | null;
  fetchedAt: number;
}
const APP_CACHE = new Map<string, CacheEntry>();
const APP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-flight promise dedupe — if two components mount simultaneously and
// both call fetchApps, they share one network request instead of racing.
const APP_INFLIGHT = new Map<string, Promise<CacheEntry | null>>();

async function fetchAppsNetwork(apiUrl: string): Promise<CacheEntry | null> {
  const cached = APP_CACHE.get(apiUrl);
  if (cached && Date.now() - cached.fetchedAt < APP_CACHE_TTL_MS) {
    return cached;
  }
  const existing = APP_INFLIGHT.get(apiUrl);
  if (existing) return existing;

  const p = (async (): Promise<CacheEntry | null> => {
    try {
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (!json.success) return null;
      const list = (json.data as AppInfo[]).filter(
        (a) => a.status !== "coming_soon" && a.installed !== false,
      );
      const quikitUrl = typeof json.quikitUrl === "string" && json.quikitUrl ? json.quikitUrl : null;
      const entry: CacheEntry = { apps: list, quikitUrl, fetchedAt: Date.now() };
      APP_CACHE.set(apiUrl, entry);
      return entry;
    } catch {
      return null;
    } finally {
      APP_INFLIGHT.delete(apiUrl);
    }
  })();
  APP_INFLIGHT.set(apiUrl, p);
  return p;
}

/** Test-only: clear both the cache and in-flight map. Exported for tests. */
export function _resetAppSwitcherCache(): void {
  APP_CACHE.clear();
  APP_INFLIGHT.clear();
}

/* ─── Icon fallbacks ─── */
const ICON_FALLBACKS: Record<string, { emoji: string; bg: string }> = {
  quikscale:   { emoji: "📊", bg: "bg-blue-100" },
  admin:       { emoji: "⚙️", bg: "bg-purple-100" },
  "super-admin": { emoji: "🛡️", bg: "bg-red-100" },
  quikhr:      { emoji: "👥", bg: "bg-green-100" },
  quikfinance: { emoji: "💰", bg: "bg-amber-100" },
  quiksales:   { emoji: "📈", bg: "bg-teal-100" },
  quikasset:   { emoji: "📦", bg: "bg-emerald-100" },
};

const DEFAULT_ICON = { emoji: "📦", bg: "bg-gray-100" };

/**
 * Brand logos by slug. These override the API-provided `iconUrl`, which is an
 * app-relative path (e.g. "/app-icons/quikscale.png") that only resolves on
 * the launcher's origin — when the switcher is hosted inside another app it
 * 404s and falls back to the emoji. Each app ships these SVGs in its own
 * public/app-icons, so a slug-relative path resolves on every origin.
 */
const BRAND_ICONS: Record<string, string> = {
  quikit: "/app-icons/quikit.svg",
  admin: "/app-icons/admin.svg",
  quikchat: "/app-icons/quikchat.svg",
  quikinfra: "/app-icons/quikinfra.svg",
  quikscale: "/app-icons/quikscale.svg",
  quiktrack: "/app-icons/quiktrack.svg",
  quiksocial: "/app-icons/quiksocial.svg",
  quikcrm: "/app-icons/quikcrm.svg",
  quikasset: "/app-icons/quikasset.svg",
  quiksupport: "/app-icons/quiksupport.svg",
  quikhrms: "/app-icons/quikhrms.svg",
};

/**
 * Google-style app switcher grid.
 *
 * Renders a 3x3 grid icon button that, when clicked, shows a popover with
 * the user's installed apps as icon tiles. Clicking an app navigates to it
 * in the same tab (SSO handles auth).
 *
 * The component is zero-config: drop it in any app's header and it will:
 *   1. Fetch the installed-apps list from /api/apps/switcher.
 *   2. Read the authoritative IdP URL from the response (sourced server-side
 *      from QUIKIT_URL), so "View all apps" works even when
 *      NEXT_PUBLIC_QUIKIT_URL wasn't set at build time.
 *   3. Auto-detect the "current" app by matching window.location.origin
 *      against each app's baseUrl, so no per-app prop is needed.
 *
 * Usage:
 *   <AppSwitcher />                                 // most apps
 *   <AppSwitcher apiUrl="/api/apps/launcher" />     // quikit super admin
 */
export function AppSwitcher({ apiUrl = "/api/apps/switcher", prefetch = true }: AppSwitcherProps = {}) {
  const [open, setOpen] = useState(false);
  // Hydrate initial state from the module cache so a re-mount doesn't flash
  // "loading" when data is already warm.
  const initialCache = APP_CACHE.get(apiUrl);
  const initialFresh = initialCache && Date.now() - initialCache.fetchedAt < APP_CACHE_TTL_MS;
  const [apps, setApps] = useState<AppInfo[]>(initialFresh ? initialCache.apps : []);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(!!initialFresh);
  const [quikitUrl, setQuikitUrl] = useState<string | null>(initialFresh ? initialCache.quikitUrl : null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch via the shared module cache so multiple components / re-mounts
  // share one request. `fetchAppsNetwork` returns instantly if cached.
  const fetchApps = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    const entry = await fetchAppsNetwork(apiUrl);
    if (entry) {
      setApps(entry.apps);
      setQuikitUrl(entry.quikitUrl);
    }
    setLoading(false);
    setFetched(true);
  }, [apiUrl, fetched]);

  // Prefetch on mount with idle priority so the first click on the switcher
  // is instant. We never prefetch if data is already warm.
  useEffect(() => {
    if (!prefetch) return;
    if (fetched) return;
    if (typeof window === "undefined") return;

    // Use requestIdleCallback where supported so we don't contend with
    // critical rendering work. Fall back to setTimeout.
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const w = window as IdleWindow;

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(() => {
        void fetchApps();
      }, { timeout: 3000 });
    } else {
      timeoutId = setTimeout(() => {
        void fetchApps();
      }, 1500);
    }
    return () => {
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [prefetch, fetched, fetchApps]);

  // Fetch on first open (fallback — normally the prefetch above has already
  // run, in which case this is a no-op thanks to the `fetched` guard).
  useEffect(() => {
    if (open && !fetched) {
      void fetchApps();
    }
  }, [open, fetched, fetchApps]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Auto-detect the active app by matching the current origin against each
  // app's baseUrl. Apps may have multiple preview URLs per environment, so
  // fall back to an origin-prefix match.
  const currentOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const currentApp = apps.find((app) => {
    try {
      return new URL(app.baseUrl).origin === currentOrigin;
    } catch {
      return false;
    }
  });

  // "View all apps" destination. Prefer the API-provided launcher URL;
  // fall back to the build-time NEXT_PUBLIC_QUIKIT_URL (set on every app,
  // points at the central launcher) so apps without a switcher API — e.g.
  // admin — still link to the real launcher /apps and not their own local
  // /apps. Bare relative "/apps" only as a last resort (launcher itself).
  const launcherBase = (quikitUrl ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
  const viewAllHref = launcherBase ? `${launcherBase}/apps` : "/apps";

  return (
    <div className="relative" ref={popoverRef}>
      {/* Grid icon button */}
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="App switcher"
        title="Switch apps"
      >
        <GridIcon />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 z-[1000] overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-semibold text-gray-900">Apps</p>
          </div>

          {/* Grid */}
          <div className="px-3 pb-3">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
              </div>
            )}

            {!loading && apps.length === 0 && (
              <div className="text-center py-6">
                <p className="text-xs text-gray-400">No apps available</p>
              </div>
            )}

            {!loading && apps.length > 0 && (
              <div className="grid grid-cols-3 gap-1">
                {apps.map((app) => {
                  const iconInfo = ICON_FALLBACKS[app.slug] || DEFAULT_ICON;
                  const iconSrc = BRAND_ICONS[app.slug] ?? app.iconUrl;
                  const isCurrent = app.id === currentApp?.id;

                  return (
                    <button
                      key={app.id}
                      onClick={() => {
                        setOpen(false);
                        // Route the launch through the auth host's post-login
                        // bridge so the user lands on the target app already
                        // signed in. Direct navigation to app.baseUrl would
                        // hit the target with no cookie (cookies don't cross
                        // hosts/ports), bouncing the user back through
                        // launcher → auth /login. The bridge reads the
                        // existing auth-host session, mints a short-lived
                        // handoff JWT, and redirects to the target's
                        // /auth-handoff endpoint, which plants a host-scoped
                        // session cookie before sending the user to
                        // /dashboard. Same mechanism the marketing landing's
                        // Login button uses (see buildLoginUrl).
                        //
                        // When already on the same app, skip the bridge —
                        // it's just a navigation to its own dashboard.
                        const target = `${app.baseUrl.replace(/\/+$/, "")}/dashboard`;
                        if (isCurrent) {
                          window.location.href = target;
                          return;
                        }
                        const authBase = (
                          (typeof process !== "undefined" && process.env.NEXT_PUBLIC_AUTH_URL) ||
                          "http://localhost:3001"
                        ).replace(/\/+$/, "");
                        window.location.href = `${authBase}/api/post-login?callbackUrl=${encodeURIComponent(target)}`;
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                        isCurrent
                          ? "bg-indigo-50"
                          : "hover:bg-gray-50"
                      }`}
                      title={app.description || app.name}
                    >
                      {iconSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={iconSrc}
                          alt={app.name}
                          className="h-10 w-10 rounded-xl object-contain"
                        />
                      ) : (
                        <div className={`h-10 w-10 rounded-xl ${iconInfo.bg} flex items-center justify-center text-xl`}>
                          {iconInfo.emoji}
                        </div>
                      )}
                      <span className="text-[11px] font-medium text-gray-700 leading-tight text-center truncate w-full">
                        {app.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer — link to full launcher */}
          <div className="border-t border-gray-100 px-4 py-2.5">
            <a
              href={viewAllHref}
              className="block text-center text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              View all apps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** 3x3 dot grid icon (Google-style) */
function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-600">
      <rect x="2" y="2" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8" y="2" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="14" y="2" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="2" y="8" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8" y="8" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="14" y="8" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="2" y="14" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8" y="14" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="14" y="14" width="4" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}
