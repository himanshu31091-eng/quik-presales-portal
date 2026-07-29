/**
 * Ask the central auth app to validate a JWT (single source of truth).
 */
export interface RemoteVerifyResult {
  valid: boolean;
  userId?: string;
  email?: string;
  /** Active tenant id from JWT (same as activeOrgId when using central auth). */
  activeOrgId?: string | null;
  orgRole?: string | null;
  isSuperAdmin?: boolean;
  /** Live status of the token's selected org: false when it has been
   *  suspended/archived. Undefined from older auth hosts (treat as active). */
  orgActive?: boolean;
  /** Live subscription/trial status of the token's selected org: false once
   *  the org's trial has expired or its subscription is past_due/canceled/
   *  expired. Undefined from older auth hosts OR when the org has no
   *  Subscription row (grandfathered) — both treated as active. Only a strict
   *  `=== false` gates, so missing/undefined never locks anyone out. */
  subscriptionActive?: boolean;
  /** True specifically when a free trial lapsed (vs. a lapsed paid plan), so
   *  the UI can show "Free Trial Expired" rather than a generic message. */
  trialExpired?: boolean;
  error?: string;
}

export interface RemoteVerifyOptions {
  authUrl?: string;
  internalSecret?: string;
  cookie?: string;
  bearer?: string;
  signal?: AbortSignal;
}

export async function verifyTokenRemote(
  opts: RemoteVerifyOptions = {},
): Promise<RemoteVerifyResult> {
  const authUrl = opts.authUrl ?? process.env.NEXT_PUBLIC_AUTH_URL ?? process.env.AUTH_URL;
  const secret = opts.internalSecret ?? process.env.INTERNAL_SECRET;

  if (!authUrl || !secret) {
    return { valid: false, error: "Auth service not configured" };
  }

  const headers: Record<string, string> = {
    "x-internal-secret": secret,
    accept: "application/json",
  };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  if (opts.cookie) headers.cookie = opts.cookie;

  try {
    const res = await fetch(`${authUrl.replace(/\/$/, "")}/api/verify-token`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: opts.signal,
    });
    if (!res.ok) {
      return { valid: false, error: `HTTP ${res.status}` };
    }
    return (await res.json()) as RemoteVerifyResult;
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
