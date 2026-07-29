/**
 * SA-A.2 — API call logging for super admin analytics.
 *
 * Fire-and-forget writes to the ApiCall table. Designed to be called from
 * auth wrappers (withOrgAuth, requireAdmin) so every API route is captured
 * without per-route instrumentation.
 *
 * Failures NEVER propagate — logging must not break a request. Writes are
 * awaited-with-catch so the caller can schedule them without blocking.
 *
 * This module imports `db` from @quikit/database and must ONLY be imported
 * from server-side code (route handlers, middleware, cron jobs). Do NOT
 * export from packages/shared/index.ts — keep it on the subpath export
 * `@quikit/shared/apiLogging` so client bundles never pull it in.
 */

import { db } from "@quikit/database";

/**
 * Normalize a request path into a reusable pattern. CUID and numeric segments
 * are replaced with `[id]` so aggregation rollups group e.g. `/api/kpi/abc123`
 * and `/api/kpi/def456` under `/api/kpi/[id]`.
 *
 * Examples:
 *   /api/kpi/clq8x9abc0001xyz/weekly   → /api/kpi/[id]/weekly
 *   /api/super/orgs/42                 → /api/super/orgs/[id]
 *   /api/health                        → /api/health (unchanged)
 */
export function normalizePathPattern(path: string): string {
  // Strip query string + trailing slash
  const cleaned = path.split("?")[0]?.replace(/\/+$/, "") ?? "";
  const segments = cleaned.split("/").map((seg) => {
    if (!seg) return seg;
    // CUID (25 chars, starts with c, alphanumeric)
    if (/^c[a-z0-9]{24}$/i.test(seg)) return "[id]";
    // UUID v4
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return "[id]";
    // Purely numeric
    if (/^\d+$/.test(seg)) return "[id]";
    return seg;
  });
  return segments.join("/") || "/";
}

export interface LogApiCallParams {
  orgId?: string | null;
  userId?: string | null;
  appSlug: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Fire-and-forget API call log. Returns a promise you can either await
 * or `void`-discard. Errors are caught internally — caller never sees them.
 *
 * Usage (fire-and-forget):
 *   void logApiCall({ ... });
 *
 * Usage (awaited, for tests):
 *   await logApiCall({ ... });
 */
export async function logApiCall(params: LogApiCallParams): Promise<void> {
  try {
    await db.apiCall.create({
      data: {
        orgId: params.orgId ?? null,
        userId: params.userId ?? null,
        appSlug: params.appSlug,
        method: params.method,
        path: params.path,
        pathPattern: normalizePathPattern(params.path),
        statusCode: params.statusCode,
        durationMs: Math.max(0, Math.round(params.durationMs)),
        ipAddress: params.ipAddress ?? null,
        // Truncate user agents at 500 chars to keep row size bounded
        userAgent: params.userAgent?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    // Never propagate — logging failure must not break the request.
    // eslint-disable-next-line no-console
    console.error("[apiLogging] Failed to write ApiCall row:", err);
  }
}

/**
 * Helper to derive the status class bucket for rollups.
 */
export function statusClassOf(statusCode: number): "2xx" | "3xx" | "4xx" | "5xx" | "other" {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return "other";
}
