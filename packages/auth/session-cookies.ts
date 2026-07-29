import type { NextResponse } from "next/server";

/**
 * Every NextAuth cookie name (plain + `__Secure-`/`__Host-` prefixed variants)
 * that can carry session/auth state. Mirrors the list in the signout-global
 * routes — kept here so the expiry / invalid-session redirect paths evict the
 * same set without duplicating it.
 */
export const NEXT_AUTH_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "next-auth.pkce.code_verifier",
  "__Secure-next-auth.pkce.code_verifier",
  "next-auth.state",
  "__Secure-next-auth.state",
] as const;

/**
 * Expire all NextAuth cookies on a response (Set-Cookie with Max-Age=0).
 *
 * Why this exists: a NextAuth session cookie is a JWE signed with
 * `NEXTAUTH_SECRET`. It stays *cryptographically valid* for its full 7–30 day
 * maxAge regardless of Redis state. When the Redis session is revoked/expired,
 * the middleware redirects the user away — but unless we also clear the cookie,
 * the browser keeps replaying the dead-but-valid cookie on every request and
 * the user is stuck bouncing until they manually clear site data. Evicting the
 * cookie here is what removes the "clear cookies to recover" requirement.
 *
 * `__Secure-`/`__Host-` prefixed cookies REQUIRE `secure: true` on the
 * Set-Cookie or the browser silently rejects the deletion, leaving the stale
 * cookie in place — so we force `secure` for those names.
 */
export function clearSessionCookies(response: NextResponse): NextResponse {
  for (const name of NEXT_AUTH_COOKIE_NAMES) {
    const isSecurePrefix =
      name.startsWith("__Secure-") || name.startsWith("__Host-");
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: isSecurePrefix || process.env.NODE_ENV === "production",
      maxAge: 0,
      expires: new Date(0),
      path: "/",
    });
  }
  return response;
}
