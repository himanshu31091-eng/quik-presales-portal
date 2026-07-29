/**
 * SA-A.3 — Hourly ApiCall → ApiCallHourlyRollup aggregation.
 *
 * Runs hourly. For each complete hour in the previous 24 hours that is not
 * already aggregated, groups raw ApiCall rows by (orgId, appSlug, method,
 * pathPattern, statusClass) and upserts into ApiCallHourlyRollup.
 *
 * Idempotent: re-running over the same window produces the same rollup
 * state (upsert semantics on the unique key).
 *
 * We aggregate a 24-hour look-back window to catch late arrivals and
 * to self-heal if the cron was down for a day.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCronOrSuperAdmin } from "@/lib/requireCronOrSuperAdmin";
import { statusClassOf } from "@quikit/shared/apiLogging";

const LOOKBACK_HOURS = 24;

function truncateToHour(d: Date): Date {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

export async function GET(req: NextRequest) {
  const { blocked, triggeredBy } = await requireCronOrSuperAdmin(req);
  if (blocked) return blocked;
  void triggeredBy; // available if we want to audit manual runs

  // Compute the window: last LOOKBACK_HOURS full hours, ending at the start
  // of the current hour. The current hour is skipped because it's still
  // accumulating raw rows.
  const now = new Date();
  const endExclusive = truncateToHour(now);
  const start = new Date(endExclusive.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  try {
    // All rows including null-tenant (pre-auth / OAuth / anonymous). For null
    // rows we use the sentinel "_global_" on the rollup side so the compound
    // unique key can disambiguate (Postgres treats NULLs as distinct, which
    // defeats uniqueness). This avoids a schema migration while still
    // capturing platform-wide metrics like login success rate.
    const raws = await db.apiCall.findMany({
      where: { createdAt: { gte: start, lt: endExclusive } },
      select: {
        orgId: true,
        appSlug: true,
        method: true,
        pathPattern: true,
        statusCode: true,
        durationMs: true,
        createdAt: true,
      },
    });

    // Group in memory — keyed by the rollup's unique tuple.
    type BucketKey = string;
    interface Bucket {
      orgId: string | null;
      appSlug: string;
      hourBucket: Date;
      method: string;
      pathPattern: string;
      statusClass: string;
      callCount: number;
      errorCount: number;
      totalDurationMs: bigint;
      maxDurationMs: number;
    }
    const buckets = new Map<BucketKey, Bucket>();

    const GLOBAL_SENTINEL = "_global_";
    for (const r of raws) {
      const hourBucket = truncateToHour(r.createdAt);
      const statusClass = statusClassOf(r.statusCode);
      // Map null orgId to sentinel so the compound unique is well-defined.
      const bucketOrgId = r.orgId ?? GLOBAL_SENTINEL;
      const key = `${bucketOrgId}|${r.appSlug}|${hourBucket.toISOString()}|${r.method}|${r.pathPattern}|${statusClass}`;
      const b = buckets.get(key);
      const isError = r.statusCode >= 400;
      if (b) {
        b.callCount += 1;
        if (isError) b.errorCount += 1;
        b.totalDurationMs += BigInt(r.durationMs);
        if (r.durationMs > b.maxDurationMs) b.maxDurationMs = r.durationMs;
      } else {
        buckets.set(key, {
          orgId: bucketOrgId,
          appSlug: r.appSlug,
          hourBucket,
          method: r.method,
          pathPattern: r.pathPattern,
          statusClass,
          callCount: 1,
          errorCount: isError ? 1 : 0,
          totalDurationMs: BigInt(r.durationMs),
          maxDurationMs: r.durationMs,
        });
      }
    }

    // Upsert each bucket. orgId is guaranteed non-null here — rows with
    // null source orgId were mapped to the "_global_" sentinel above so
    // the compound @@unique works correctly.
    let upserted = 0;
    for (const b of buckets.values()) {
      if (!b.orgId) continue; // defensive
      await db.apiCallHourlyRollup.upsert({
        where: {
          orgId_appSlug_hourBucket_method_pathPattern_statusClass: {
            orgId: b.orgId,
            appSlug: b.appSlug,
            hourBucket: b.hourBucket,
            method: b.method,
            pathPattern: b.pathPattern,
            statusClass: b.statusClass,
          },
        },
        update: {
          callCount: b.callCount,
          errorCount: b.errorCount,
          totalDurationMs: b.totalDurationMs,
          maxDurationMs: b.maxDurationMs,
        },
        create: {
          orgId: b.orgId,
          appSlug: b.appSlug,
          hourBucket: b.hourBucket,
          method: b.method,
          pathPattern: b.pathPattern,
          statusClass: b.statusClass,
          callCount: b.callCount,
          errorCount: b.errorCount,
          totalDurationMs: b.totalDurationMs,
          maxDurationMs: b.maxDurationMs,
        },
      });
      upserted += 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        windowStart: start.toISOString(),
        windowEnd: endExclusive.toISOString(),
        rawRowsScanned: raws.length,
        bucketsUpserted: upserted,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Rollup failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
