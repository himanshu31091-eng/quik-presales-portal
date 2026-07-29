/**
 * FRD FR-SA-004 / FR-OA-005 — classify an email address into the SSO provider
 * Quikit will route it through. Used by the invite form to pick the right CTA
 * ("Sign in with Google" vs "Sign in with Microsoft") in the email template,
 * and to validate that an SSO invite was sent to a workable address.
 *
 * Architecture
 * ------------
 * - This file is the *client-safe* surface. It only knows the public consumer
 *   domains everyone agrees on (gmail.com / outlook.com / etc.) — no
 *   corporate / vanity domains hardcoded.
 * - For corporate emails (e.g. user@yourcompany.com), the authoritative
 *   classification is by MX record lookup, which is server-only because it
 *   requires Node's `dns` module. That lives in `./sso-domain-server.ts` and
 *   is imported via the dedicated subpath `@quikit/shared/sso-domain-server`.
 *
 * Client code should call `validateSsoEmail` (cheap format check) and then
 * defer to the server endpoint that submits the invite — the server is the
 * one that actually decides if the address is Microsoft or Google.
 */

import { SSO_PROVIDER, type SsoProvider } from "./constants";

/**
 * Public consumer domains that always belong to the named provider. These
 * are stable identities that don't need an MX lookup. Anything outside this
 * list is a custom / corporate domain — the *server-side* MX classifier
 * decides which provider hosts its email.
 */
const GOOGLE_CONSUMER_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "google.com",
]);

const MICROSOFT_CONSUMER_DOMAINS = new Set<string>([
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "office365.com",
  "microsoft.com",
  "microsoftonline.com",
]);

/**
 * True if `domain` equals or is a subdomain of any base in `set`.
 * `dev.google.com` matches a set containing `google.com`.
 */
function matchesDomainSet(domain: string, set: Set<string>): boolean {
  if (set.has(domain)) return true;
  for (const base of set) {
    if (domain.endsWith(`.${base}`)) return true;
  }
  return false;
}

/** Pull the lowercased domain part out of an email, or null if malformed. */
export function extractEmailDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return domain || null;
}

/**
 * Synchronous classifier for the *consumer-domain fast path* + the well-known
 * `*.onmicrosoft.com` heuristic. Returns null for any custom corporate domain
 * — call `classifySsoProviderAsync` (server-only, MX-based) to resolve those.
 */
export function classifySsoProvider(email: string): SsoProvider | null {
  const domain = extractEmailDomain(email);
  if (!domain) return null;

  if (matchesDomainSet(domain, GOOGLE_CONSUMER_DOMAINS)) return SSO_PROVIDER.GOOGLE;
  if (matchesDomainSet(domain, MICROSOFT_CONSUMER_DOMAINS)) return SSO_PROVIDER.MICROSOFT;

  // Microsoft 365 tenants always have an `<orgname>.onmicrosoft.com` shadow
  // domain — accepting it removes the need for an MX lookup in that case.
  if (domain.endsWith(".onmicrosoft.com")) return SSO_PROVIDER.MICROSOFT;

  return null;
}

/**
 * Cheap form-time validation. Used by client code before submission. Only
 * checks that the address parses as an email — does NOT try to pin down the
 * provider. The server's MX-based classifier is the source of truth.
 *
 * Returns null if OK, otherwise a user-facing error string.
 */
export function validateSsoEmail(email: string): string | null {
  if (!extractEmailDomain(email)) {
    return "Please enter a valid email address.";
  }
  return null;
}

/** Internal — exposed so the server-side MX module can reuse the matchers. */
export const _ssoInternal = {
  GOOGLE_CONSUMER_DOMAINS,
  MICROSOFT_CONSUMER_DOMAINS,
  matchesDomainSet,
  extractEmailDomain,
};
