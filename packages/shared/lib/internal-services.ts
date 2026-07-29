/**
 * Allowlist of services authorised to call internal auth endpoints
 * (`POST /api/auth/internal/issue-agent-jwt`, etc.). The `requestingService`
 * field on every internal request is checked against this set; anything else
 * gets a 403 FORBIDDEN.
 *
 * Adding a service: send a PR adding to this list. No auth-service deploy
 * required if you also import this constant into the endpoint that gates on
 * it (the endpoint reads the live module on each request).
 *
 * Why a hardcoded list and not env var: this is a security boundary. We want
 * the diff that broadens it to be reviewable in source control, not a silent
 * env change that bypasses code review.
 */
export const INTERNAL_SERVICE_ALLOWLIST = new Set<string>([
  "ai-runtime",
  "search",
  "comms",
  "launcher",
]);

export type InternalService = "ai-runtime" | "search" | "comms" | "launcher";

export function isAllowedInternalService(service: string): boolean {
  return INTERNAL_SERVICE_ALLOWLIST.has(service);
}
