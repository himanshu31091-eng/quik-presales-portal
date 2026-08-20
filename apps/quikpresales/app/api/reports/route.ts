import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, validationError } from "@/lib/api/responses";
import { cacheOrCompute } from "@quikit/shared/redisCache";
import { computeReportsData } from "@/lib/reports";

// Gated on the `dashboard` resource, same as Weekly Dashboard and Team
// Overview — every seeded role already holds `dashboard:view`, so Reports is
// visible immediately rather than waiting on a nav-key backfill for orgs
// whose roles were seeded before this module existed.
const withReportsAuth = withOrgAuthForModule("dashboard");

const query = z.object({
  /** Trailing (and, for the forecast, forward-looking) window, in months. */
  months: z.coerce.number().int().min(3).max(24).default(6),
});

const CACHE_TTL = 300;

/** GET /api/reports — pipeline, win rate, revenue, forecast, turnaround, demo performance. */
export const GET = withReportsAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "dashboard", "view");
  if (denied) return denied;

  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { months } = parsed.data;

  const data = await cacheOrCompute(`ps:reports:${orgId}:${months}`, CACHE_TTL, () =>
    computeReportsData(orgId, months),
  );

  return okSerialized(data);
});
