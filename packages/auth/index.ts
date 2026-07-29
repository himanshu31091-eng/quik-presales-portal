import { type NextAuthOptions } from "next-auth";
// Side-effect import: loads the next-auth module augmentation in types.ts
// so the Session.user shape inside this file recognizes firstName/lastName.
import "./types";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import { db } from "@quikit/database";
import bcrypt from "bcryptjs";
import {
  createAuthSession,
  isAuthSessionActive,
  revokeAuthSession,
  touchAuthSession,
} from "./session-store";

/**
 * How often to confirm the JWT's `sessionId` is still alive in Redis.
 * Each check is a single Redis EXISTS; throttling avoids per-request hits
 * while keeping revoke-takes-effect within this window across all apps.
 * Fail-open: when Redis is unreachable, isAuthSessionActive() returns true.
 */
const SESSION_CHECK_INTERVAL = 30 * 1000;
import { setOAuthPrefill } from "./oauth-prefill-store";

export interface AuthConfig {
  signInPage: string;
  errorPage: string;
}

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  isSuperAdmin?: boolean;
  orgId?: string;
  membershipRole?: string;
  /** Redis-backed session id carried from the central IdP id_token claim. */
  sessionId?: string;
  /** Stashed by Google/Azure profile() callbacks for post-OAuth pre-fill. */
  oauthFirstName?: string;
  oauthLastName?: string;
}

/** Split a single "First Last" string into parts (Microsoft profile shape). */
function splitName(name: string | undefined | null): { first: string; last: string } {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { first: "", last: "" };
  const idx = trimmed.indexOf(" ");
  if (idx < 0) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1).trim() };
}

export function createAuthOptions(config: AuthConfig): NextAuthOptions {
  return {
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials, req) {
          if (!credentials?.email || !credentials?.password) {
            throw new Error("Invalid credentials");
          }

          // Rate-limits removed (per user request).
          //
          // The forgot-password / set-password / re-signin chain triggers 2
          // credential signIns per attempt; the old per-email limit of 5 in
          // 15 minutes locked legitimate users out of the reset flow after
          // only 2-3 retries — surfaced to the UI as a misleading
          // "Temporary password is incorrect" error.
          //
          // Brute-force / credential-stuffing protection now lives ONLY in
          // the auth host's middleware + the underlying `/api/auth/...`
          // route handlers (e.g. `/api/auth/forgot-password` keeps its
          // per-IP + per-email throttles). The credentials provider itself
          // no longer throttles login attempts.
          // _req parameter kept to preserve the helper import; suppresses
          // unused-import lint.
          void req;

          // Case-insensitive lookup so existing rows whose `email` was stored
          // with the casing the admin originally typed (e.g. "Foo@Bar.com")
          // still match what the user types into the sign-in form.
          const user = await db.user.findFirst({
            where: {
              email: {
                equals: String(credentials.email),
                mode: "insensitive",
              },
            },
          });

          if (!user || !user.password) {
            throw new Error("Invalid credentials");
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );

          if (!isPasswordValid) {
            throw new Error("Invalid credentials");
          }

          // Unlike the old in-memory limiter, we can't cheaply reset the
          // counter on success — Redis TTL owns the bucket. Not resetting is
          // fine: successful logins are within the allowed-count window and
          // the bucket expires on its own.

          // Users added by a super admin start with empty firstName/lastName
          // (collected on first login via /complete-profile). Fall back to
          // email so session.user.name is never blank.
          const fullName = `${user.firstName} ${user.lastName}`.trim();
          return {
            id: user.id,
            email: user.email,
            name: fullName || user.email,
            isSuperAdmin: user.isSuperAdmin,
          };
        },
      }),
      // Google OAuth — only registered when both env vars are set so the
      // provider never appears in /api/auth/providers in dev environments
      // that haven't configured it.
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? [
            GoogleProvider({
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              // Force account chooser every time — avoids silent re-use of a
              // previously linked Google account when the user wants to
              // switch.
              authorization: { params: { prompt: "select_account" } },
              profile(profile) {
                return {
                  // Placeholder id — `signIn` callback replaces it with the
                  // DB User.id once we've confirmed the email exists.
                  id: profile.sub,
                  email: profile.email ?? "",
                  name: profile.name ?? "",
                  oauthFirstName: profile.given_name ?? "",
                  oauthLastName: profile.family_name ?? "",
                } as AuthUser;
              },
            }),
          ]
        : []),
      // Microsoft OAuth (Azure AD / Entra ID). MICROSOFT_TENANT_ID="common"
      // accepts both work/school and personal Microsoft accounts. Set a
      // specific tenant GUID to restrict to one organization.
      ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
        ? [
            AzureADProvider({
              clientId: process.env.MICROSOFT_CLIENT_ID,
              clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
              tenantId: process.env.MICROSOFT_TENANT_ID || "common",
              profile(profile) {
                // Azure AD's id_token rarely splits given/family — derive
                // both from `name` so we always have something to pre-fill.
                const split = splitName(profile.name);
                return {
                  id: (profile as { sub?: string; oid?: string }).sub ?? (profile as { oid?: string }).oid ?? "",
                  email:
                    (profile as { email?: string }).email ??
                    (profile as { preferred_username?: string }).preferred_username ??
                    "",
                  name: profile.name ?? "",
                  oauthFirstName: split.first,
                  oauthLastName: split.last,
                } as AuthUser;
              },
            }),
          ]
        : []),
    ],
    pages: {
      signIn: config.signInPage,
      error: config.errorPage,
    },
    session: {
      strategy: "jwt",
      maxAge: 30 * 24 * 60 * 60,
    },
    jwt: {
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 30 * 24 * 60 * 60,
    },
    callbacks: {
      /**
       * Gate every OAuth sign-in on the email already existing in the User
       * table. Returning a URL string redirects there; new users are NOT
       * auto-created — they need to be added by an org admin first.
       *
       * Side-effect: stash the OAuth profile's first/last name in the
       * pre-fill store (Redis, 10-min TTL) keyed by the matched DB user
       * id. The post-login profile-confirmation form reads this to
       * pre-populate its inputs. We deliberately do NOT write the names
       * to the User row here — keeping firstName/lastName empty until
       * the user clicks Continue is what makes the post-login profile
       * gate route them to the form (matches credentials behavior).
       */
      async signIn({ user, account }) {
        if (account?.provider === "google" || account?.provider === "azure-ad") {
          const email = (user.email ?? "").toLowerCase();
          if (!email) {
            console.warn("[auth.signIn] OAuth attempt with no email on profile");
            return "/login?reason=invalid_user_info";
          }
          // Case-insensitive lookup so historical rows that were inserted
          // with the original mixed-case email (e.g. "Pravin.Sharma@quikit.ai")
          // still match a lowercased OAuth email. Postgres' `mode: "insensitive"`
          // uses ILIKE under the hood, which still benefits from a regular
          // index on lower(email) — but for our membership volumes a normal
          // index scan is fine.
          const dbUser = await db.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              isSuperAdmin: true,
            },
          });
          if (!dbUser) {
            console.warn("[auth.signIn] OAuth login rejected — unknown email:", email);
            return "/login?reason=invalid_user_info";
          }
          // FRD FR-SA-006 / FR-OA-004 — auto-accept any pending SSO invitation
          // for this user. We promote OrgMember rows where inviteMethod=sso and
          // status=invited to status=active, granting the corresponding
          // UserAppAccess rows. This is the SSO equivalent of the native
          // accept-invite endpoint POST handler.
          //
          // BR-005 — the SSO-authenticated email must equal the email the
          // invitation was sent to. Because OrgMember.userId points at the
          // User row whose `email` column we just matched, this equality is
          // automatic: a different OAuth email would have produced a different
          // (or null) `dbUser` above. So no explicit comparison is needed
          // here, but the audit log captures the link for traceability.
          const pendingInvites = await db.orgMember.findMany({
            where: {
              userId: dbUser.id,
              status: "invited",
              inviteMethod: "sso",
            },
          });
          for (const inv of pendingInvites) {
            await db.orgMember.update({
              where: { id: inv.id },
              data: {
                status: "active",
                acceptedAt: new Date(),
                invitationToken: null,
              },
            });
            if (inv.inviteAppIds && inv.inviteAppIds.length > 0) {
              const userAppRole = inv.role === "app_admin" ? "admin" : "member";
              await db.userAppAccess.createMany({
                data: inv.inviteAppIds.map((appId) => ({
                  userId: dbUser.id,
                  orgId: inv.orgId,
                  appId,
                  role: userAppRole,
                  grantedBy: inv.createdBy,
                })),
                skipDuplicates: true,
              });
            }
          }

          // Replace the provider-supplied id with the actual DB id so
          // downstream callbacks find the right OrgMember rows.
          user.id = dbUser.id;
          user.email = dbUser.email;
          (user as AuthUser).isSuperAdmin = dbUser.isSuperAdmin;

          // Stash OAuth names for the post-login form to pre-fill. Always
          // write — even if the DB row already has names — so the form
          // can show the latest provider-supplied values when users want
          // to refresh. Cleared by the PATCH endpoint on save.
          const oauthFirst = (user as AuthUser).oauthFirstName ?? "";
          const oauthLast = (user as AuthUser).oauthLastName ?? "";
          try {
            await setOAuthPrefill(dbUser.id, {
              firstName: oauthFirst,
              lastName: oauthLast,
            });
          } catch (err) {
            console.error("[auth.signIn] failed to stash OAuth pre-fill:", err);
          }
          return true;
        }
        return true;
      },
      async jwt({ token, user, trigger, session }) {
        // Soft-revocation: every JWT refresh after the initial sign-in
        // re-checks Redis for the session id. If the key has been deleted
        // (admin force-logout, TTL expiry, sibling-app signOut), nuke the
        // claims and the session callback will short-circuit. Throttled to
        // SESSION_CHECK_INTERVAL so we hit Redis at most once per window.
        // Fail-open by design (Redis down → treated as active).
        if (!user && token.sessionId) {
          const lastChecked = (token.sessionCheckedAt as number | undefined) ?? 0;
          if (Date.now() - lastChecked > SESSION_CHECK_INTERVAL) {
            const active = await isAuthSessionActive(String(token.sessionId));
            if (!active) return {};
            token.sessionCheckedAt = Date.now();
          }
        }

        if (user) {
          token.id = user.id;
          token.email = user.email;
          token.isSuperAdmin = (user as AuthUser).isSuperAdmin ?? false;
          token.sessionId = await createAuthSession(user.id, 30 * 24 * 60 * 60);
          token.sessionTouchedAt = Date.now();
          token.sessionCheckedAt = Date.now();

          // OAuth pre-fill: when the user came from Google/Azure, stash the
          // provider's given/family name on the JWT so the post-login profile
          // step can pre-fill its inputs even though the User row's
          // firstName/lastName columns are still empty.
          const oauthFirst = (user as AuthUser).oauthFirstName;
          const oauthLast = (user as AuthUser).oauthLastName;
          if (oauthFirst) token.oauthFirstName = oauthFirst;
          if (oauthLast) token.oauthLastName = oauthLast;

          // FRD FR-SA-006 — auto-accept any pending NATIVE invitations for
          // this user. SSO invites are accepted in the signIn callback
          // above (which runs only for OAuth providers), so credentials
          // logins would otherwise leave invited memberships in status
          // "invited" — token.orgId stays undefined and the launcher
          // /apps can never resolve an org for them.
          // The user has authenticated against their stored password, so
          // we treat that as proof of identity equivalent to clicking the
          // accept-invite link.
          // NOT filtered by `inviteMethod` — deliberately, and this is a bug fix.
          //
          // This callback runs on EVERY initial sign-in, credentials and OAuth
          // alike (NextAuth passes `user` on the first pass for both). Filtering
          // to `inviteMethod: "native"` therefore created a dead corner: an
          // invitation minted as `native` (any flow that seeds a temp password —
          // the LMS roster, for one) was never accepted if the invitee happened
          // to sign in with Google or Microsoft. The `signIn` callback above
          // only picks up `sso` invites, so nothing accepted theirs. Their
          // membership stayed `invited`, `createGetOrgId` found no active org,
          // and they were bounced to the launcher on every attempt — a person
          // who could never log in, with no error explaining why.
          //
          // The method label describes how the invite was CREATED, not how the
          // person chooses to authenticate; coupling acceptance to it was the
          // mistake. Both existing rationales justify auto-accept by proof of
          // identity — the SSO email matched this User row, or the password
          // matched — and neither depends on the label. So accept any pending
          // invitation for the now-authenticated user.
          const pendingNativeInvites = await db.orgMember.findMany({
            where: {
              userId: user.id,
              status: "invited",
            },
          });
          for (const inv of pendingNativeInvites) {
            await db.orgMember.update({
              where: { id: inv.id },
              data: {
                status: "active",
                acceptedAt: new Date(),
                invitationToken: null,
              },
            });
            if (inv.inviteAppIds && inv.inviteAppIds.length > 0) {
              const userAppRole = inv.role === "app_admin" ? "admin" : "member";
              await db.userAppAccess.createMany({
                data: inv.inviteAppIds.map((appId) => ({
                  userId: user.id,
                  orgId: inv.orgId,
                  appId,
                  role: userAppRole,
                  grantedBy: inv.createdBy,
                })),
                skipDuplicates: true,
              });
            }
          }

          // Auto-select an active org on initial sign-in so the user is
          // dropped straight onto the launcher (/apps) with an org already
          // resolved. Multi-org users switch orgs from the launcher's
          // /apps org dropdown on demand.
          //
          // MOST RECENT, not oldest. This used to order `createdAt: "asc"`,
          // which silently defeated every new invitation for anyone who already
          // belonged to an org: invite an existing user to a new SCHOOL tenant,
          // they accept, sign in — and the session resolved their oldest
          // membership instead, dropping them in a CORPORATE org from months
          // earlier, with that org's dashboard and modules. 24 users in
          // production hold multiple active memberships, so this was not an
          // edge case. The org someone was just invited to is the one they are
          // trying to reach; the launcher dropdown still switches away from it.
          const firstMembership = await db.orgMember.findFirst({
            // Skip suspended orgs so a user is never auto-dropped into one on
            // sign-in. If all their orgs are suspended they land org-less and
            // the middleware bounces them to the launcher (where the org is
            // also hidden). Mirrors org.status === "active" gating below.
            where: { userId: user.id, status: "active", org: { status: "active" } },
            orderBy: { createdAt: "desc" },
            select: { orgId: true, role: true },
          });
          if (firstMembership) {
            token.orgId = firstMembership.orgId;
            token.membershipRole = firstMembership.role;
            token.membershipCheckedAt = Date.now();
          }
        }

        const SESSION_TOUCH_INTERVAL = 5 * 60 * 1000;
        if (
          token.sessionId &&
          (!token.sessionTouchedAt ||
            Date.now() - (token.sessionTouchedAt as number) > SESSION_TOUCH_INTERVAL)
        ) {
          await touchAuthSession(String(token.sessionId), 30 * 24 * 60 * 60);
          token.sessionTouchedAt = Date.now();
        }

        if (trigger === "update" && session) {
          if (session.orgId === null) {
            token.orgId = undefined;
            token.membershipRole = undefined;
            token.membershipCheckedAt = undefined;
          } else if (session.orgId) {
            token.orgId = session.orgId;
            token.membershipRole = session.membershipRole;
            token.membershipCheckedAt = Date.now();
          }
        }

        // Re-validate membership every 5 minutes
        const RECHECK_INTERVAL = 5 * 60 * 1000;
        if (
          token.orgId &&
          token.id &&
          (!token.membershipCheckedAt ||
            Date.now() - (token.membershipCheckedAt as number) > RECHECK_INTERVAL)
        ) {
          const membership = await db.orgMember.findFirst({
            where: {
              userId: token.id as string,
              orgId: token.orgId as string,
              status: "active",
              // A suspended org invalidates the session's selected org just
              // like a revoked membership: the query returns null, we clear
              // orgId + flag membershipInvalid, and the middleware bounces the
              // user to the launcher (where the suspended org is hidden).
              org: { status: "active" },
            },
          });

          if (!membership) {
            token.orgId = undefined;
            token.membershipRole = undefined;
            token.membershipCheckedAt = undefined;
            token.membershipInvalid = true;
          } else {
            token.membershipRole = membership.role;
            token.membershipCheckedAt = Date.now();
            token.membershipInvalid = undefined;
          }
        }

        return token;
      },
      async session({ session, token }) {
        session.user = {
          ...session.user,
          id: token.id as string,
          email: token.email as string,
          orgId: token.orgId as string | undefined,
          membershipRole: token.membershipRole as string | undefined,
          membershipInvalid: token.membershipInvalid as boolean | undefined,
          isSuperAdmin: token.isSuperAdmin as boolean | undefined,
        };
        return session;
      },
      /**
       * Cross-domain post-login routing.
       *
       * NextAuth credentials sign-in sets a host-only cookie on this app's
       * origin. Sub-apps (`quikscale.vercel.app`, `quik-it-auth.vercel.app`,
       * …) live on different hosts and need their own per-host cookies —
       * the auth-app session is invisible to them otherwise.
       *
       * Strategy: instead of redirecting straight to the user-supplied
       * `callbackUrl`, route through `${baseUrl}/api/post-login?callbackUrl=…`.
       * That endpoint reads the (freshly created) session, mints a 120-second
       * HS256 handoff token signed with `INTERNAL_SECRET`, and bounces the
       * browser to `${targetOrigin}/auth-handoff?token=…`, where the target
       * sub-app exchanges the token for its own session cookie.
       *
       * Same-origin callbacks (e.g. the auth app's own /post-login flows) are
       * returned verbatim — no handoff needed when nothing crosses a domain.
       *
       * Allow-list: only `callbackUrl` values matching one of the documented
       * Vercel UAT / GKE prod origins (extensible via
       * `AUTH_ALLOWED_RETURN_ORIGINS`) reach the post-login bridge. Anything
       * else falls back to the launcher's `/apps` page — preserving the
       * historical safe destination.
       */
      async redirect({ url, baseUrl }) {
        const launcherUrl =
          (process.env.NEXT_PUBLIC_QUIKIT_URL ?? process.env.QUIKIT_URL ?? baseUrl).replace(/\/$/, "");
        const launcherApps = `${launcherUrl}/apps`;

        // Relative URLs always resolve against this auth app's origin.
        if (url.startsWith("/")) {
          return `${baseUrl}${url}`;
        }

        let target: URL;
        try {
          target = new URL(url);
        } catch {
          // Malformed URL → route the user through the post-login bridge
          // to the launcher (gets them a session cookie on the launcher
          // host instead of stranding them here).
          const bridge = new URL("/api/post-login", baseUrl);
          bridge.searchParams.set("callbackUrl", launcherApps);
          return bridge.toString();
        }

        // Same-origin callback → no cross-domain cookie needed.
        if (target.origin === baseUrl) {
          return url;
        }

        // Cross-origin allow-list. Defaults cover Vercel UAT + GKE prod;
        // extend via env without redeploying this package.
        const defaults = [
          "https://quik-it-auth.vercel.app",
          "https://quikscale.vercel.app",
          "https://quik-it-admin.vercel.app",
          "https://quiktrack.vercel.app",
          "https://quikvc.vercel.app",
          "https://quiksocial.vercel.app",
          "https://quikinfra.vercel.app",
          "https://apps.quikit.ai",
          "https://scale.quikit.ai",
          "https://orgadmin.quikit.ai",
          "https://track.quikit.ai",
          "https://crm.quikit.ai",
          "https://social.quikit.ai",
          "https://quikinfra.quikit.ai",
          "https://quikhrms.vercel.app",
          "https://people.quikit.ai",
          "https://support.quikit.ai",
          "https://asset.quikit.ai",
          // QuikLMS / QuikSkill. Absent until now, which meant a post-login
          // callback to the LMS failed this check and fell through to the
          // launcher instead of landing the user in the app they signed in for.
          "https://quikskill.vercel.app",
          "https://quikskills.quikit.ai",
          // UAT custom domains (uat<app>.quikit.ai) — added alongside prod.
          "https://uatapps.quikit.ai",
          "https://uatscale.quikit.ai",
          "https://uatorgadmin.quikit.ai",
          "https://uattrack.quikit.ai",
          "https://uatcrm.quikit.ai",
          "https://uatsocial.quikit.ai",
          "https://uatinfra.quikit.ai",
          "https://uatpeople.quikit.ai",
          "https://uatsupport.quikit.ai",
          "https://uatasset.quikit.ai",
        ];
        const fromEnv = (process.env.AUTH_ALLOWED_RETURN_ORIGINS ?? "")
          .split(",")
          .map((s) => s.trim().replace(/\/$/, ""))
          .filter(Boolean);
        const allowed = new Set([...defaults, ...fromEnv]);

        const finalCallback = allowed.has(target.origin) ? url : launcherApps;
        const bridge = new URL("/api/post-login", baseUrl);
        bridge.searchParams.set("callbackUrl", finalCallback);
        return bridge.toString();
      },
    },
    events: {
      async signIn({ user }) {
        await db.user.update({
          where: { id: user.id! },
          data: { lastSignInAt: new Date() },
        });
        // SA-A.5: record a SessionEvent for analytics.
        // orgId is not yet known at signIn (org selection happens after),
        // so we log with orgId=null and a follow-up session event can be
        // emitted by the app's own layout/middleware once a tenant is active.
        try {
          await db.sessionEvent.create({
            data: {
              userId: user.id!,
              orgId: null,
              event: "login",
              appSlug: "quikit",
            },
          });
        } catch {
          // Never break sign-in on a logging failure.
        }
      },
      async signOut({ token }) {
        if (!token?.id) return;
        const sessionId = token.sessionId as string | undefined;
        if (sessionId) {
          await revokeAuthSession(sessionId);
        }
        try {
          await db.sessionEvent.create({
            data: {
              userId: token.id as string,
              orgId: (token.orgId as string | undefined) ?? null,
              event: "logout",
              appSlug: "quikit",
            },
          });
        } catch {
          // no-op
        }
      },
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   OAuth Client Auth — for apps that authenticate via QuikIT as IdP
   ═══════════════════════════════════════════════════════════════════════════

   Usage in apps/quikscale/lib/auth.ts:
     import { createOAuthClientOptions } from "@quikit/auth";
     export const authOptions = createOAuthClientOptions({
       quikitUrl: process.env.QUIKIT_URL!,
       clientId: process.env.QUIKIT_CLIENT_ID!,
       clientSecret: process.env.QUIKIT_CLIENT_SECRET!,
     });
   ═══════════════════════════════════════════════════════════════════════════ */

export interface OAuthClientConfig {
  /** Base URL of the QuikIT gateway (e.g., "http://localhost:3000") */
  quikitUrl: string;
  /** OAuth client_id registered in QuikIT's OAuthClient table */
  clientId: string;
  /** OAuth client_secret (plain text — compared against bcrypt hash in QuikIT) */
  clientSecret: string;
  /** Page to redirect to if auth fails (defaults to quikitUrl + /login) */
  errorPage?: string;
}

/**
 * Creates NextAuth options for an app that authenticates via QuikIT's
 * OAuth2/OIDC flow. The user never sees a login page on the app itself —
 * they're redirected to QuikIT to authenticate, then redirected back
 * with an authorization code that's exchanged for tokens.
 */
export function createOAuthClientOptions(config: OAuthClientConfig): NextAuthOptions {
  const { quikitUrl, clientId, clientSecret } = config;

  return {
    providers: [
      {
        id: "quikit",
        name: "QuikIT",
        type: "oauth",
        // OIDC discovery — NextAuth fetches /.well-known/openid-configuration
        // to locate jwks_uri and verify the id_token signature. Without this,
        // the callback errors out with OAUTH_CALLBACK_ERROR before userinfo
        // is ever called.
        wellKnown: `${quikitUrl}/.well-known/openid-configuration`,
        issuer: quikitUrl,
        idToken: true,
        authorization: {
          params: { scope: "openid profile email tenant" },
        },
        clientId,
        clientSecret,
        checks: ["state"],
        profile(profile) {
          return {
            id: profile.sub,
            email: profile.email,
            name: profile.name,
            orgId: profile.tenant_id,
            membershipRole: profile.role,
            // Shared Redis session id minted by the central IdP. Lets this app
            // be soft-invalidated from the same session store (see verifyJWT).
            sessionId: profile.sessionId,
          };
        },
      },
    ],
    pages: {
      signIn: `${quikitUrl}/login`,
      error: config.errorPage ?? `${quikitUrl}/login`,
    },
    session: {
      strategy: "jwt",
      maxAge: 7 * 24 * 60 * 60, // 7 days (shorter than IdP — refresh via OAuth)
    },
    jwt: {
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 7 * 24 * 60 * 60,
    },
    // Log the full OAuth error (NextAuth's default logger truncates multi-line
     // messages in serverless output, hiding the actual cause of callback failures).
    logger: {
      error(code, metadata) {
        // NextAuth passes metadata as { error, providerId } on OAuth callback
        // failures. Unwrap recursively so the underlying openid-client error
        // message appears inline (Vercel truncates multi-line stacks).
        function describe(e: unknown, depth = 0): string {
          if (depth > 4 || e == null) return String(e);
          if (e instanceof Error) {
            const cause = (e as { cause?: unknown }).cause;
            const extras: string[] = [];
            for (const k of Object.keys(e)) {
              // serialize extra props openid-client sets (e.g., response, checks)
              try {
                extras.push(`${k}=${JSON.stringify((e as unknown as Record<string, unknown>)[k])}`);
              } catch {
                extras.push(`${k}=<unserializable>`);
              }
            }
            return `${e.name}:${e.message}${extras.length ? " {" + extras.join(",") + "}" : ""}${cause ? " <caused by> " + describe(cause, depth + 1) : ""}`;
          }
          if (typeof e === "object") {
            const parts: string[] = [];
            for (const [k, v] of Object.entries(e as Record<string, unknown>)) {
              parts.push(`${k}=${describe(v, depth + 1)}`);
            }
            return `{${parts.join(",")}}`;
          }
          try { return JSON.stringify(e); } catch { return String(e); }
        }
        // Chunk the serialized message into short pieces so Vercel's truncated
        // log table (which cuts off around 30 chars per Message column) still
        // surfaces the full string across multiple rows.
        const full = describe(metadata);
        const CHUNK = 120;
        const total = Math.ceil(full.length / CHUNK) || 1;
        for (let i = 0; i < total; i++) {
          const part = full.slice(i * CHUNK, (i + 1) * CHUNK);
          // eslint-disable-next-line no-console
          console.error(`[qka][${code}][${i + 1}/${total}] ${part}`);
        }
      },
      warn(code) {
        // eslint-disable-next-line no-console
        console.warn(`[quikit-auth][warn][${code}]`);
      },
      debug() {
        // no-op in production
      },
    },
    callbacks: {
      async jwt({ token, user, account }) {
        // Soft-revocation: on every JWT refresh after initial sign-in,
        // confirm the shared sessionId minted by the central IdP still
        // exists in Redis. If not, drop all claims so this consumer-app
        // session falls through to the unauthenticated branch in middleware.
        // Throttled and fail-open (Redis down → treated as active).
        if (!user && token.sessionId) {
          const lastChecked = (token.sessionCheckedAt as number | undefined) ?? 0;
          if (Date.now() - lastChecked > SESSION_CHECK_INTERVAL) {
            const active = await isAuthSessionActive(String(token.sessionId));
            if (!active) return {};
            token.sessionCheckedAt = Date.now();
          }
        }

        // On initial sign-in (after OAuth callback), populate token from user profile
        if (user) {
          token.id = user.id;
          token.email = user.email;
          token.orgId = (user as AuthUser).orgId;
          token.membershipRole = (user as AuthUser).membershipRole;
          token.isSuperAdmin = false; // Apps don't inherit super admin status
          // Carry the shared session id so verifyJWT (and the central
          // /api/verify-token) can soft-invalidate this app's session when the
          // central session is revoked.
          token.sessionId = (user as AuthUser).sessionId;
          token.sessionCheckedAt = Date.now();
        }
        // Store the access_token + refresh_token from the OAuth exchange
        if (account) {
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.accessTokenExpires = Date.now() + (account.expires_in as number ?? 3600) * 1000;
        }
        // SA-D: if the token is an impersonation session (set directly by the
        // accept endpoint), the impersonating flag + claims are already on it
        // and we must pass them through unchanged. Don't overwrite.
        return token;
      },
      async session({ session, token }) {
        // SA-D: when impersonation is active, hard-fail the session if the
        // expiry passed. Returning a session without user.id effectively
        // signs the user out (middleware will bounce them to /login).
        if (token.impersonating && token.impersonationExpiresAt) {
          if (new Date(token.impersonationExpiresAt).getTime() < Date.now()) {
            return { ...session, user: { ...session.user, id: "" as string, email: "" } as never };
          }
        }
        // Compose display name from firstName/lastName if the token carries
        // them (the launcher's hand-off mint includes profile fields so the
        // consumer app's header / avatar can render real names instead of
        // the generic "User" placeholder).
        const firstName = token.firstName as string | undefined;
        const lastName = token.lastName as string | undefined;
        const composedName =
          (token.name as string | undefined) ??
          (firstName || lastName
            ? `${firstName ?? ""} ${lastName ?? ""}`.trim()
            : undefined);

        session.user = {
          ...session.user,
          id: token.id as string,
          email: token.email as string,
          orgId: token.orgId as string | undefined,
          membershipRole: token.membershipRole as string | undefined,
          // Mirror the token's super-admin claim through to the session so
          // platform super-admins see correct UI affordances inside consumer
          // apps. (Was hardcoded to false; restored to token-driven value.)
          isSuperAdmin: Boolean(token.isSuperAdmin),
          name: composedName,
          firstName,
          lastName,
          impersonating: token.impersonating,
          impersonatorUserId: token.impersonatorUserId,
          impersonatorEmail: token.impersonatorEmail,
          impersonationExpiresAt: token.impersonationExpiresAt,
        };
        return session;
      },
    },
    events: {
      // Global-session logout: revoke the shared Redis session id so signing
      // out of this app invalidates the session across every sibling app
      // (one shared session id, one shared Redis — see createAuthSession).
      async signOut({ token }) {
        const sessionId = token?.sessionId as string | undefined;
        if (sessionId) {
          await revokeAuthSession(sessionId);
        }
      },
    },
  };
}
