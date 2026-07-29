
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { publicBaseUrl } from "../public-url";
import { clearSessionCookies, NEXT_AUTH_COOKIE_NAMES } from "../session-cookies";

/**
 * Regression coverage for the production "redirect to https://0.0.0.0:3001/
 * login?reason=no_session" + stale-cookie lockout bug.
 *
 * Root cause: auth-flow redirects were built from `request.url`, whose host
 * resolves to the pod bind address (HOSTNAME=0.0.0.0 / PORT=3001) when the
 * ingress doesn't preserve the public Host header. And the invalid-session
 * path never evicted the dead-but-cryptographically-valid session cookie, so
 * users had to manually clear cookies to recover.
 */

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

describe("publicBaseUrl", () => {
  const ORIG_ENV = { ...process.env };
  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
  });
  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it("prefers NEXTAUTH_URL over a bind-address Host header", () => {
    process.env.NEXTAUTH_URL = "https://authn.quikit.ai";
    const req = makeRequest("http://0.0.0.0:3001/api/post-login");
    expect(publicBaseUrl(req)).toBe("https://authn.quikit.ai");
  });

  it("falls back to X-Forwarded-Host/Proto when NEXTAUTH_URL is missing", () => {
    const req = makeRequest("http://0.0.0.0:3001/login", {
      "x-forwarded-host": "authn.quikit.ai",
      "x-forwarded-proto": "https",
    });
    expect(publicBaseUrl(req)).toBe("https://authn.quikit.ai");
  });

  it("ignores a NEXTAUTH_URL that is itself a bind address and uses the forwarded host", () => {
    process.env.NEXTAUTH_URL = "http://0.0.0.0:3001";
    const req = makeRequest("http://0.0.0.0:3001/login", {
      "x-forwarded-host": "authn.quikit.ai",
    });
    expect(publicBaseUrl(req)).toBe("https://authn.quikit.ai");
  });

  it("uses a valid Host header when no env / forwarded headers are present", () => {
    const req = makeRequest("https://authn.quikit.ai/login");
    expect(publicBaseUrl(req)).toBe("https://authn.quikit.ai");
  });

  it("a /login redirect built on the resolved base never targets 0.0.0.0", () => {
    process.env.NEXTAUTH_URL = "https://authn.quikit.ai";
    const req = makeRequest("http://0.0.0.0:3001/api/post-login");
    const target = new URL("/login?reason=no_session", publicBaseUrl(req));
    expect(target.hostname).not.toBe("0.0.0.0");
    expect(target.toString()).toBe(
      "https://authn.quikit.ai/login?reason=no_session",
    );
  });
});

describe("clearSessionCookies", () => {
  it("expires every NextAuth cookie with Max-Age=0", () => {
    const res = NextResponse.redirect(
      "https://authn.quikit.ai/login?reason=no_session",
    );
    clearSessionCookies(res);
    for (const name of NEXT_AUTH_COOKIE_NAMES) {
      const cookie = res.cookies.get(name);
      expect(cookie?.value).toBe("");
      expect(cookie?.maxAge).toBe(0);
    }
  });

  it("forces Secure on __Secure-/__Host- prefixed deletions (else the browser ignores them)", () => {
    const res = NextResponse.redirect("https://authn.quikit.ai/login");
    clearSessionCookies(res);
    expect(res.cookies.get("__Secure-next-auth.session-token")?.secure).toBe(true);
    expect(res.cookies.get("__Host-next-auth.csrf-token")?.secure).toBe(true);
  });
});
