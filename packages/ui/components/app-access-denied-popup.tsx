"use client";

/**
 * AppAccessDeniedPopup — shown on an app's public landing page when a user
 * who is signed in but NOT granted access to this app is bounced back here.
 *
 * Two upstream redirects land the user on `/?reason=no_app_access`:
 *   1. The central OAuth authorize endpoint (quikit) — a direct SSO sign-in
 *      into an app the user isn't granted redirects to
 *      `${app.baseUrl}/?reason=no_app_access` instead of proceeding through the
 *      callback / dashboard.
 *   2. The shared SessionGuard — if the user slips into the dashboard and the
 *      `/api/session/validate` poll reports `app_access_revoked`, it navigates
 *      to `/?reason=no_app_access` (WITHOUT signing out — see session-guard.tsx).
 *
 * The popup reads the marker on mount (client-only, so no Suspense boundary is
 * required), strips it from the URL, and shows a dismissible dialog naming the
 * app. Everything else is decided dynamically from the user's real permissions
 * via `/api/apps/switcher` (same-origin, DB-backed, identical to the launcher
 * visibility rule):
 *
 *   - Has OTHER accessible apps  → show "Go to my apps" (deep-links to the
 *     launcher /apps; the user is already authenticated so there's no re-login).
 *   - Has NO other apps          → hide "Go to my apps" (nowhere to go) and
 *     widen the message accordingly. Only "OK" is offered.
 *   - Session/endpoint unknown   → keep "Go to my apps" as a safe default; the
 *     launcher renders its own empty state if there's truly nothing.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert } from "lucide-react";

export interface AppAccessDeniedPopupProps {
  /** Display name of the current app, e.g. "QuikScale". Rendered in the message. */
  appName: string;
  /** Same-origin endpoint returning `{ data: App[], quikitUrl }`. Defaults to
   *  the standard per-app switcher route. */
  switcherEndpoint?: string;
}

const REASON = "no_app_access";

// otherApps sentinel:
//   null → still loading      -1 → could not determine (unauthenticated/error)
//    0   → definitively none   >0 → that many other accessible apps
type OtherAppsState = number | null;

export function AppAccessDeniedPopup({
  appName,
  switcherEndpoint = "/api/apps/switcher",
}: AppAccessDeniedPopupProps) {
  const [open, setOpen] = useState(false);
  const [otherApps, setOtherApps] = useState<OtherAppsState>(null);
  const [launcherUrl, setLauncherUrl] = useState<string>(
    (process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, ""),
  );
  // Run the setup exactly once. React StrictMode (dev) double-invokes effects;
  // because the first invocation strips the URL markers via replaceState, a
  // naive second invocation would see no `reason` and bail — discarding the
  // in-flight switcher result and leaving the button hidden forever. This ref
  // makes the second invocation a no-op so the first run's fetch result sticks.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") !== REASON) return; // not our page — don't latch
    started.current = true;
    setOpen(true);

    // The central authorize endpoint (OAuth "Login" path) already computed the
    // answer and passed it here, because on this landing page there is no local
    // session yet so /api/apps/switcher would 401:
    //   others = number of OTHER apps the user can reach (authoritative)
    //   home   = the launcher origin (so the link works without NEXT_PUBLIC_*)
    const othersParam = params.get("others");
    const homeParam = params.get("home");
    if (homeParam && /^https?:\/\//i.test(homeParam)) {
      setLauncherUrl(homeParam.replace(/\/+$/, ""));
    }

    // Strip our markers so a manual reload doesn't re-trigger the popup.
    for (const k of ["reason", "others", "home"]) params.delete(k);
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);

    if (othersParam !== null && othersParam !== "") {
      const n = Number.parseInt(othersParam, 10);
      setOtherApps(Number.isFinite(n) ? n : -1);
      return; // authoritative — no need to hit the switcher
    }

    // SessionGuard path: the user still holds a live session on this host, so
    // determine the count from the DB-backed switcher. It only returns apps the
    // user actually has access to (never the current app — they were just
    // denied it), so its length IS the "other accessible apps" count.
    // No cancel-on-cleanup: the `started` ref already prevents a duplicate run,
    // and StrictMode remounts the SAME component, so applying the result is safe.
    void (async () => {
      try {
        const res = await fetch(switcherEndpoint, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) {
          setOtherApps(-1); // e.g. 401 → unknown, keep button (safe default)
          return;
        }
        const json: { data?: unknown; quikitUrl?: unknown } = await res.json();
        const apps = Array.isArray(json.data) ? json.data : [];
        setOtherApps(apps.length);
        if (typeof json.quikitUrl === "string" && json.quikitUrl) {
          setLauncherUrl(json.quikitUrl.replace(/\/+$/, ""));
        }
      } catch {
        setOtherApps(-1); // network error → unknown, keep button (safe default)
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  const noOtherApps = otherApps === 0;
  // Show "Go to my apps" unless we're still loading or know there are none.
  const showGoToApps =
    Boolean(launcherUrl) && otherApps !== null && otherApps !== 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(13,17,23,0.45)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-access-denied-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              padding: 28,
              background: "#FFFFFF",
              color: "#0D1117",
              border: "1px solid rgba(13,17,23,0.08)",
              borderRadius: 20,
              boxShadow: "0 1px 3px rgba(13,17,23,0.05), 0 30px 70px rgba(13,17,23,0.22)",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(220,38,38,0.10)",
                  color: "#DC2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ShieldAlert style={{ width: 22, height: 22 }} />
              </span>
              <h3
                id="app-access-denied-title"
                style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2, margin: 0 }}
              >
                Access not granted
              </h3>
            </div>

            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
              You don&apos;t have access to <strong style={{ color: "#0D1117" }}>{appName}</strong>.
              {noOtherApps ? (
                <>
                  {" "}There are no other apps assigned to your account yet. Please contact
                  your administrator to request access.
                </>
              ) : (
                <> Please contact your administrator to request access.</>
              )}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              {showGoToApps && (
                <a
                  href={`${launcherUrl}/apps`}
                  style={{
                    padding: "10px 18px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#0D1117",
                    background: "#F7F7F4",
                    border: "1px solid rgba(13,17,23,0.08)",
                    borderRadius: 12,
                    textDecoration: "none",
                  }}
                >
                  Go to my apps
                </a>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  background: "#0D1117",
                  border: "none",
                  borderRadius: 12,
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
