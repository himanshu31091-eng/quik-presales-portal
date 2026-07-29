/**
 * Where an invitee lands after accepting an invitation and setting a password.
 *
 * THE BUG THIS FIXES. `apps/auth/app/invitations/accept/page.tsx` passed a
 * hardcoded `redirectPath={launcherApps}`, so EVERY invitee — no matter which
 * app invited them — was signed in on the auth host and then dropped on the
 * QuikIT launcher's app grid. For someone a corporate tenant invited from
 * inside QuikSkill that is a dead end: they never asked for a launcher, they
 * were told they had been added to an LMS. They then have to spot the right
 * tile and click through a second handoff.
 *
 * An invitation minted from inside an app records exactly which app it was for
 * (`OrgMember.inviteAppIds`; QuikSkill writes `[quiklms.id]` in
 * `apps/quiklms/lib/services/identity-service.ts`). When that is a single app
 * we can send the invitee straight into it.
 *
 * WHY THE POST-LOGIN BRIDGE AND NOT THE APP URL DIRECTLY. Sign-in during the
 * accept flow runs on the AUTH HOST, and NextAuth session cookies are
 * host-only. Navigating straight to `https://quikskill.vercel.app/` would
 * arrive with no cookie for that host, the app's middleware would bounce the
 * brand-new user back out to SSO, and the "log me in immediately" promise is
 * broken again — just with an extra hop. `/api/post-login` is the platform's
 * existing cross-domain bridge: it mints a short-lived INTERNAL_SECRET-signed
 * token and redirects to `<app>/auth-handoff?token=…`, which mints the app's
 * own cookie. It is the same landing contract the launcher's tile click uses
 * (`/api/launch-token` → `<baseUrl>/auth-handoff`), so the invitee ends up in
 * exactly the state a normal launch produces.
 *
 * DELIBERATELY CONSERVATIVE. Returns `null` — meaning "keep the old launcher
 * behaviour" — for anything other than a single, resolvable app. A multi-app
 * invitation genuinely has no single destination, and the launcher's grid IS
 * the right answer there.
 */

export interface InviteRedirectInput {
  /** This auth host's own public origin, e.g. `https://authn.quikit.ai`. */
  authOrigin: string;
  /** `OrgMember.inviteAppIds` — the apps the inviter granted. */
  appIds: readonly string[] | null | undefined;
  /** `App.baseUrl` for the single invited app, when there is exactly one. */
  appBaseUrl: string | null | undefined;
}

/**
 * Builds the post-accept redirect, or `null` to fall back to the launcher.
 *
 * Callers do the DB lookup (this package must stay free of a Prisma import so
 * it can be used from middleware/edge contexts); the policy lives here so it is
 * testable without a database.
 */
export function inviteRedirectUrl({
  authOrigin,
  appIds,
  appBaseUrl,
}: InviteRedirectInput): string | null {
  // No app, or a choice to make → the launcher grid is the correct destination.
  if (!appIds || appIds.length !== 1) return null;
  if (!appBaseUrl) return null;

  let appOrigin: string;
  try {
    const parsed = new URL(appBaseUrl.trim());
    // An App row is super-admin-editable. Refuse anything that isn't plain
    // http(s) so a `javascript:` / `data:` baseUrl can never become the
    // destination of a freshly authenticated session.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    appOrigin = parsed.origin;
  } catch {
    return null;
  }

  let base: string;
  try {
    base = new URL(authOrigin).origin;
  } catch {
    return null;
  }

  // Land on the app root. Every app's `/` either IS the signed-in home or
  // redirects an authenticated visitor to their role landing — QuikSkill's
  // marketing page does exactly that via `landingPathFor(role, tenantType)`.
  // Hardcoding a dashboard path here would guess wrong per app and per role.
  const callbackUrl = `${appOrigin}/`;
  return `${base}/api/post-login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
