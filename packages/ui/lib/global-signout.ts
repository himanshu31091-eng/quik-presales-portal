/**
 * Single-Logout (SLO) helper.
 *
 * Logging out of one app must clear cookies on THREE hosts:
 *   1. The originating app (e.g. quikscale.vercel.app)        — local cookie
 *   2. The auth host        (auth-quikit.vercel.app)          — IdP cookie
 *   3. The launcher         (quik-it-auth.vercel.app)         — launcher cookie
 *
 * Without clearing all three, the next "Login" click would silently
 * re-authenticate the user via leftover session cookies on the auth host.
 *
 * Flow:
 *   1. `localSignOut()` clears the originating app's cookie.
 *   2. Browser navigates to `<authUrl>/api/auth/signout-global?callbackUrl=
 *      <launcherUrl>/api/auth/signout-global?callbackUrl=<postLogoutRedirect>`.
 *      The auth-host endpoint clears its cookies and forwards.
 *   3. The launcher endpoint clears its cookies and forwards to
 *      `postLogoutRedirect` — typically the originating app's landing page.
 *
 * Net effect: one click, fully logged out, user lands back on the marketing
 * surface they came from.
 *
 * Usage (from quikscale):
 *
 *   import { signOut } from "next-auth/react";
 *   import { globalSignOut } from "@quikit/ui";
 *
 *   await globalSignOut({
 *     authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
 *     quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
 *     localSignOut: () => signOut({ redirect: false }),
 *     postLogoutRedirect: window.location.origin + "/", // back to landing
 *   });
 *
 * On the launcher itself, `authUrl` may be omitted only if you've also
 * arranged for the auth cookie to be cleared some other way; otherwise
 * the user stays signed in to the auth host.
 */

export interface GlobalSignOutOptions {
  /**
   * Origin of the central auth host (e.g.
   * `https://auth-quikit.vercel.app`). When supplied, the sign-out chain
   * passes through `<authUrl>/api/auth/signout-global` to clear the
   * auth-host cookie before the launcher cookie. Omit only when you've
   * already cleared the auth cookie via another path.
   */
  authUrl?: string;
  /**
   * Origin of the QuikIT launcher (e.g.
   * `https://quik-it-auth.vercel.app`). The launcher's signout-global
   * endpoint clears its host cookie and forwards the user to the final
   * `postLogoutRedirect`. Defaults to `window.location.origin` (only
   * sensible on the launcher itself).
   */
  quikitUrl?: string;
  /**
   * Clears the current app's session cookie. Typically
   * `() => signOut({ redirect: false })` from next-auth/react.
   */
  localSignOut: () => Promise<unknown> | unknown;
  /**
   * Where to land after the global sign-out completes. Should be an
   * absolute URL (e.g. `https://quikscale.vercel.app/`) so the chain can
   * traverse origins. Defaults to `<quikitUrl>/`.
   */
  postLogoutRedirect?: string;
}

export async function globalSignOut(options: GlobalSignOutOptions): Promise<void> {
  const { authUrl, quikitUrl, localSignOut, postLogoutRedirect } = options;

  // 1) Clear local app cookie first so there's no race if navigation is slow.
  try {
    await localSignOut();
  } catch {
    // Never let local cookie-clear failure block the global sign-out.
  }

  if (typeof window === "undefined") return;

  // 1.5) Fully clear browser storage so no per-user UI state bleeds into the
  // next session (important on shared devices). Runs AFTER localSignOut() so
  // NextAuth's same-app cross-tab logout broadcast (`next-auth.message`) has
  // already been written and received by sibling tabs. No auth/session data
  // lives in storage — sessions are HttpOnly cookies + Redis — so a full wipe
  // is safe; the page load below also drops in-memory React/React Query state.
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // Storage access can throw under strict cookie/storage policies
    // (e.g. third-party-cookie blockers). Never block sign-out on this.
  }

  const idp = (quikitUrl && quikitUrl.trim()) || window.location.origin;
  const idpClean = idp.replace(/\/+$/, "");
  const finalRedirect =
    (postLogoutRedirect && postLogoutRedirect.trim()) || `${idpClean}/`;

  // Launcher SLO hop — clears launcher cookie, then forwards to final.
  const launcherSlo = `${idpClean}/api/auth/signout-global?callbackUrl=${encodeURIComponent(finalRedirect)}`;

  // Optional auth-host SLO hop. When configured, we hit the auth host
  // FIRST so its cookie is cleared before the user reaches the launcher
  // chain (or final destination).
  let target = launcherSlo;
  if (authUrl && authUrl.trim()) {
    const authClean = authUrl.trim().replace(/\/+$/, "");
    target = `${authClean}/api/auth/signout-global?callbackUrl=${encodeURIComponent(launcherSlo)}`;
  }

  // 2) Navigate. Use location.href (full page load) so all in-memory app
  // state + React Query cache + module caches are cleared too.
  window.location.href = target;
}
