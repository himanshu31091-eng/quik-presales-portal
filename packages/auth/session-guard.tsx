"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

// Background poll for revoked access. Set to 24h because:
//   1. Server-side JWT callback already re-checks membership every 5min
//      on any authenticated request (packages/auth/index.ts RECHECK_INTERVAL).
//      Active users catch revocation within 5 min regardless of this poll.
//   2. Focus/visibility listener below ALSO validates immediately whenever
//      the user returns to the tab. Active users = effectively instant.
//   3. Only fully idle tabs (user never focuses for 24h) wait the full
//      interval to detect server-side revocation.
//
// Trade: DB load on /api/session/validate drops ~1,700x vs the previous 60s
// poll at the cost of 24h worst-case for idle-tab-with-revoked-access.
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
/** Add ±30min jitter to prevent thundering herd when many clients poll simultaneously */
function jitteredInterval() {
  return CHECK_INTERVAL + Math.floor(Math.random() * 3_600_000) - 1_800_000;
}

export interface SessionGuardConfig {
  validateEndpoint?: string;
  loginRoute?: string;
}

async function validateSession(endpoint: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return { valid: false, reason: "validation_error" };
    return await res.json();
  } catch {
    // Network error — treat as valid to avoid false logouts on transient failures,
    // but log for observability
    console.warn("[session-guard] Validation fetch failed, assuming valid");
    return { valid: true };
  }
}

export function createSessionGuard(config: SessionGuardConfig = {}) {
  const endpoint = config.validateEndpoint || "/api/session/validate";
  const loginRoute = config.loginRoute || "/login";

  async function handleInvalid(reason?: string) {
    // Org suspended by a super-admin: the user stays authenticated (they may
    // belong to other orgs) but is bounced to the launcher's org picker, which
    // surfaces the suspension popup and hides the suspended org. Cross-domain →
    // hard nav. We do NOT signOut — only this org is off-limits, not the user.
    if (reason === "org_suspended") {
      const launcher = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
      window.location.href = `${launcher}/apps?reason=org_suspended`;
      return;
    }
    // No access to THIS app (never granted, or trial/access revoked): send the
    // user to this app's public landing page, where <AppAccessDeniedPopup />
    // surfaces an app-specific "contact your administrator" message.
    //
    // Deliberately NO signOut here. Two reasons:
    //   1. On localhost every app shares one host (cookies aren't port-scoped),
    //      so signing out of this app would ALSO drop the central launcher
    //      session — clicking "Go to my apps" would then bounce through /login
    //      even though the user is already authenticated.
    //   2. The popup needs a live session to query /api/apps/switcher and decide
    //      whether the user has any OTHER apps (→ show/hide "Go to my apps").
    // The user keeps their (unusable-here) session; this guard + the landing
    // popup keep them out of the app, and /apps still recognizes them. Hard nav
    // so the marketing server component re-runs with the marker.
    if (reason === "app_access_revoked") {
      window.location.href = `/?reason=no_app_access`;
      return;
    }
    // Membership deactivated for the whole org → central login is correct.
    await signOut({ callbackUrl: `${loginRoute}?reason=deactivated` });
  }

  return function SessionGuard({ children }: { children: React.ReactNode }) {
    const { status, update } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Validate on mount AND on every route change. Soft navigations between
    // modules don't remount this guard (the layout persists), so without the
    // pathname dependency a user could keep clicking modules inside a
    // suspended/revoked org without re-validation. Each nav is user activity,
    // so re-checking here mirrors the existing focus-listener philosophy.
    useEffect(() => {
      if (status !== "authenticated") return;
      async function check() {
        const data = await validateSession(endpoint);
        if (!data.valid) await handleInvalid(data.reason);
      }
      check();
    }, [status, pathname]);

    useEffect(() => {
      if (status !== "authenticated") return;
      async function poll() {
        const data = await validateSession(endpoint);
        if (!data.valid) { await handleInvalid(data.reason); return; }
        const updated = await update();
        if (updated?.user?.membershipInvalid) await handleInvalid("deactivated");
        else if (updated && !updated.user?.orgId) {
          // Org selection lives on the central launcher, not a per-app page.
          // Cross-domain → hard nav (router.push can't leave the origin).
          const launcher = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
          window.location.href = launcher ? `${launcher}/apps` : "/apps";
        }
      }
      intervalRef.current = setInterval(poll, jitteredInterval());
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [status]);

    useEffect(() => {
      if (status !== "authenticated") return;
      async function onFocus() {
        const data = await validateSession(endpoint);
        if (!data.valid) await handleInvalid(data.reason);
      }
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    }, [status]);

    return <>{children}</>;
  };
}
