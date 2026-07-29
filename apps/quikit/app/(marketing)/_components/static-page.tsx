import Script from "next/script";
import { buildLoginUrl } from "@quikit/shared/login-url";
import { getPageSchemas } from "../_lib/schema";

export type StaticPageData = {
  route: string;
  slug: string;
  title: string;
  styleText: string;
  bodyHtml: string;
  scripts: string[];
};


/**
 * Launcher login URL. Marketing is auth-less; its "Log in" CTA redirects
 * to the central auth app (`NEXT_PUBLIC_AUTH_URL/login`) carrying a
 * `callbackUrl` so successful sign-in returns the user to the launcher
 * `/apps` page on this app's own origin.
 *
 * The previous in-page modal (login-modal.tsx) is retired — every sub-app
 * now uses the same auth-app-driven login flow for parity, and the
 * auth app's `redirect` callback allow-lists the launcher origin so the
 * round-trip works.
 */
const LOGIN_URL = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
  postLoginPath: "/apps",
});

/**
 * Self-serve registration lives on the central auth app at `/register`
 * (the 3-step workspace → OTP → password wizard). Built from the same
 * `NEXT_PUBLIC_AUTH_URL` base as `buildLoginUrl`, with the same dev fallback
 * (:3001). Literal env access so webpack's DefinePlugin can inline it in the
 * client bundle — see `buildLoginUrl`/env.ts for why dynamic lookups break.
 * The wizard auto-signs-in and lands the user on the launcher `/apps` on
 * completion, so no `callbackUrl` is needed here.
 */
const SIGNUP_URL = `${(process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "")}/register`;

/**
 * Turn the marketing navbar's single primary CTA into a "Sign In →" + "Sign Up"
 * pair: "Sign In" points at the central login, "Sign Up" at the self-serve
 * registration wizard. The baked-in blobs ship a "Book a demo → /contact"
 * primary button in both the desktop `.nav-actions` and the mobile
 * `.mobile-nav-cta`; we swap each for the two-button pair. The nav HTML is
 * identical across every _data/*.json page, so doing this once here covers all
 * pages rather than mutating a dozen content blobs. Idempotent — skips if
 * already transformed. The hero "Get In Touch / Book a demo" buttons
 * (btn-outline) are left unchanged.
 */
function withLoginCta(html: string): string {
  if (html.includes("data-quikit-login")) return html;
  const authCta =
    `<a href="${LOGIN_URL}" data-quikit-login class="btn btn-primary">Sign In</a>` +
    `<a href="${SIGNUP_URL}" data-quikit-signup class="btn btn-outline">Sign Up</a>`;
  const authCtaMobile =
    `<a href="${LOGIN_URL}" data-quikit-login class="btn btn-primary mobile-nav-cta">Sign In →</a>` +
    `<a href="${SIGNUP_URL}" data-quikit-signup class="btn btn-outline mobile-nav-cta">Sign Up</a>`;
  let out = html;
  // Mobile primary CTA first (more specific selector), then desktop.
  out = out.replace(
    /<a [^>]*class="btn btn-primary mobile-nav-cta">Book a demo[^<]*<\/a>/,
    authCtaMobile,
  );
  out = out.replace(
    /<a [^>]*class="btn btn-primary">Book a demo[^<]*<\/a>/,
    authCta,
  );
  return out;
}

export function StaticPage({ page }: { page: StaticPageData }) {
  const schemas = getPageSchemas(page.slug);
  const bodyHtml = withLoginCta(page.bodyHtml);
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={`${page.slug}-jsonld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <style dangerouslySetInnerHTML={{ __html: page.styleText }} />
      <main dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      {page.scripts.map((script, index) => (
        <Script
          id={`${page.slug}-script-${index}`}
          key={`${page.slug}-script-${index}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ))}
    </>
  );
}
