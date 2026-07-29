/**
 * Server-only SSO classifier. Resolves a domain's MX records to determine
 * whether its email is hosted on Microsoft 365 or Google Workspace, so we
 * don't have to maintain a hardcoded list of corporate / vanity domains.
 *
 * Why server-only: this file imports Node's `dns/promises`. Re-exporting it
 * from the shared package barrel would pull DNS into client bundles. Import
 * it via the dedicated subpath instead:
 *
 *     import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
 *
 * Detection rule of thumb (covers >99% of real-world tenants):
 *
 *   Microsoft 365 → MX hosts end with one of:
 *     `mail.protection.outlook.com`
 *     `eo.outlook.com`
 *     `outlook.com`
 *     `mail.eo.outlook.com`
 *
 *   Google Workspace → MX hosts end with one of:
 *     `aspmx.l.google.com`
 *     `googlemail.com`
 *     `google.com`
 *     `googlemail.l.google.com`
 *
 * If MX lookup fails (timeout, NXDOMAIN, no records), we return `null` —
 * the caller surfaces the FRD §7 error instructing the admin to use a
 * different invite method.
 */

import { resolveMx } from "node:dns/promises";
import { SSO_PROVIDER, type SsoProvider } from "./constants";
import { classifySsoProvider, _ssoInternal } from "./sso-domain";

const MICROSOFT_MX_SUFFIXES = [
  "mail.protection.outlook.com",
  "eo.outlook.com",
  "mail.eo.outlook.com",
  "outlook.com",
];

const GOOGLE_MX_SUFFIXES = [
  "aspmx.l.google.com",
  "googlemail.l.google.com",
  "googlemail.com",
  "google.com",
];

/** True if any MX `exchange` ends with a suffix in `suffixes`. */
function mxMatches(
  records: Array<{ exchange: string; priority: number }>,
  suffixes: string[],
): boolean {
  for (const r of records) {
    const host = (r.exchange || "").toLowerCase().replace(/\.$/, "");
    if (!host) continue;
    for (const s of suffixes) {
      if (host === s || host.endsWith(`.${s}`)) return true;
    }
  }
  return false;
}

/**
 * Module-scoped cache so the same domain isn't re-resolved on every form
 * submission. Entries TTL out after `MX_CACHE_TTL_MS`. Negative results
 * (no MX or lookup error) get a shorter TTL so transient DNS failures
 * don't lock out a domain for a full hour.
 */
const MX_CACHE_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<
  string,
  { provider: SsoProvider | null; expiresAt: number }
>();

/**
 * MX-record-based classification. Tries the sync consumer-domain path first
 * (no DNS round-trip for gmail/outlook/etc.), then falls back to a real DNS
 * MX lookup for custom corporate domains.
 */
export async function classifySsoProviderAsync(
  email: string,
): Promise<SsoProvider | null> {
  const fast = classifySsoProvider(email);
  if (fast) return fast;

  const domain = _ssoInternal.extractEmailDomain(email);
  if (!domain) return null;

  const cached = cache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.provider;

  let provider: SsoProvider | null = null;
  try {
    const records = await resolveMx(domain);
    if (mxMatches(records, MICROSOFT_MX_SUFFIXES)) {
      provider = SSO_PROVIDER.MICROSOFT;
    } else if (mxMatches(records, GOOGLE_MX_SUFFIXES)) {
      provider = SSO_PROVIDER.GOOGLE;
    }
  } catch {
    // NXDOMAIN, ENOTFOUND, timeout — leave provider as null.
  }

  cache.set(domain, {
    provider,
    expiresAt:
      Date.now() + (provider ? MX_CACHE_TTL_MS : NEGATIVE_TTL_MS),
  });

  return provider;
}

/**
 * Server-side replacement for the synchronous `validateSsoEmail`. Returns
 * null when the email is a workable Google or Microsoft address; otherwise
 * the FRD §7 error string.
 */
export async function validateSsoEmailAsync(
  email: string,
): Promise<string | null> {
  if (!_ssoInternal.extractEmailDomain(email)) {
    return "Please enter a valid email address.";
  }
  const provider = await classifySsoProviderAsync(email);
  if (!provider) {
    return "SSO invitations require a Google or Microsoft email address.";
  }
  return null;
}
