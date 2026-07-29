import { describe, it, expect } from "vitest";
import { inviteRedirectUrl } from "../invite-redirect";

/**
 * REGRESSION GUARD for "a corporate learner invited from inside QuikSkill sets
 * their password and gets dumped on the QuikIT launcher".
 *
 * The accept page hardcoded the launcher as the post-accept destination, so the
 * app that actually minted the invitation was ignored. `OrgMember.inviteAppIds`
 * has carried that app all along — QuikSkill writes `[quiklms.id]` when it
 * creates the membership — it simply was never read on the way back out.
 *
 * The two directions that both have to hold:
 *   - single-app invitation  → into that app, via the cross-host bridge
 *   - anything else          → null, i.e. unchanged launcher behaviour
 */

const AUTH = "https://authn.quikit.ai";
const LMS = "https://quikskill.vercel.app";

describe("single-app invitation", () => {
  it("routes the invitee into the inviting app", () => {
    const url = inviteRedirectUrl({
      authOrigin: AUTH,
      appIds: ["app_quiklms"],
      appBaseUrl: LMS,
    });
    expect(url).toBe(
      `${AUTH}/api/post-login?callbackUrl=${encodeURIComponent(`${LMS}/`)}`,
    );
  });

  it("goes through /api/post-login rather than the app URL directly", () => {
    // Navigating straight to the app would arrive with no cookie for that host
    // (NextAuth cookies are host-only) and bounce the new user back into SSO.
    const url = inviteRedirectUrl({
      authOrigin: AUTH,
      appIds: ["app_quiklms"],
      appBaseUrl: LMS,
    })!;
    expect(url.startsWith(`${AUTH}/api/post-login`)).toBe(true);
    expect(url.startsWith(LMS)).toBe(false);
  });

  it("normalises a baseUrl carrying a path, query or trailing slash", () => {
    for (const raw of [`${LMS}/`, `${LMS}/apps/home`, `${LMS}?x=1`, ` ${LMS} `]) {
      expect(inviteRedirectUrl({ authOrigin: AUTH, appIds: ["a"], appBaseUrl: raw })).toBe(
        `${AUTH}/api/post-login?callbackUrl=${encodeURIComponent(`${LMS}/`)}`,
      );
    }
  });

  it("keeps the port on a localhost dev baseUrl", () => {
    const url = inviteRedirectUrl({
      authOrigin: "http://localhost:3001",
      appIds: ["a"],
      appBaseUrl: "http://localhost:3020",
    });
    expect(url).toBe(
      `http://localhost:3001/api/post-login?callbackUrl=${encodeURIComponent("http://localhost:3020/")}`,
    );
  });
});

describe("falls back to the launcher (returns null)", () => {
  it("when the invitation names several apps — there is no single destination", () => {
    expect(
      inviteRedirectUrl({ authOrigin: AUTH, appIds: ["a", "b"], appBaseUrl: LMS }),
    ).toBeNull();
  });

  it("when the invitation names no app at all", () => {
    expect(inviteRedirectUrl({ authOrigin: AUTH, appIds: [], appBaseUrl: LMS })).toBeNull();
    expect(inviteRedirectUrl({ authOrigin: AUTH, appIds: null, appBaseUrl: LMS })).toBeNull();
    expect(
      inviteRedirectUrl({ authOrigin: AUTH, appIds: undefined, appBaseUrl: LMS }),
    ).toBeNull();
  });

  it("when the app has no registered baseUrl", () => {
    expect(
      inviteRedirectUrl({ authOrigin: AUTH, appIds: ["a"], appBaseUrl: null }),
    ).toBeNull();
    expect(inviteRedirectUrl({ authOrigin: AUTH, appIds: ["a"], appBaseUrl: "" })).toBeNull();
  });

  it("when the baseUrl is not parseable as an absolute URL", () => {
    for (const bad of ["quikskill.vercel.app", "/apps", "not a url"]) {
      expect(
        inviteRedirectUrl({ authOrigin: AUTH, appIds: ["a"], appBaseUrl: bad }),
      ).toBeNull();
    }
  });
});

describe("refuses non-http(s) schemes", () => {
  // App rows are super-admin editable. A hostile baseUrl must never become the
  // landing target of a session that was just authenticated.
  it.each(["javascript:alert(1)", "data:text/html,<script>1</script>", "file:///etc/passwd"])(
    "%s",
    (bad) => {
      expect(
        inviteRedirectUrl({ authOrigin: AUTH, appIds: ["a"], appBaseUrl: bad }),
      ).toBeNull();
    },
  );

  it("rejects an unparseable authOrigin rather than emitting a relative URL", () => {
    expect(
      inviteRedirectUrl({ authOrigin: "not-an-origin", appIds: ["a"], appBaseUrl: LMS }),
    ).toBeNull();
  });
});
