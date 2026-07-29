/**
 * Returns the most-recent observed timestamp for each sub-daily cron's
 * output. The UI uses this to display "Last updated at X" next to each
 * "Run now" button so the super admin knows how stale the data is.
 *
 * No dedicated CronRun table — we just read the most recent row from the
 * respective output tables:
 *   - rollup-api-calls → max(updatedAt) on ApiCallHourlyRollup
 *   - health-check     → max(checkedAt) on AppHealthCheck
 *   - evaluate-alerts  → max(lastSeenAt) on PlatformAlert (or null if never run)
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";

export const GET = withSuperAdminAuth(async () => {
  try {
    const [lastRollup, lastHealth, lastAlert] = await Promise.all([
      db.apiCallHourlyRollup.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      db.appHealthCheck.findFirst({
        orderBy: { checkedAt: "desc" },
        select: { checkedAt: true },
      }),
      db.platformAlert.findFirst({
        orderBy: { lastSeenAt: "desc" },
        select: { lastSeenAt: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        rollup: lastRollup?.updatedAt?.toISOString() ?? null,
        healthCheck: lastHealth?.checkedAt?.toISOString() ?? null,
        alerts: lastAlert?.lastSeenAt?.toISOString() ?? null,
        now: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load last-run timestamps";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
