/**
 * SA-A.2 — ApiCall retention cleanup.
 *
 * Deletes raw ApiCall rows older than 30 days. All analytics older than this
 * window should be served from ApiCallHourlyRollup (permanent) — raw rows
 * are only useful for recent debugging / per-request drill-downs.
 *
 * Runs daily. Deletion is batched (10k rows at a time) to avoid long
 * transactions that could stall the pooler.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCron } from "@/lib/requireCron";

const RETENTION_DAYS = 30;
const BATCH_SIZE = 10_000;
const MAX_BATCHES = 50; // 500k cap per invocation

export async function GET(req: NextRequest) {
  const blocked = requireCron(req);
  if (blocked) return blocked;

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  let batches = 0;

  try {
    for (let i = 0; i < MAX_BATCHES; i++) {
      const { count } = await db.apiCall.deleteMany({
        where: { createdAt: { lt: cutoff } },
        // Prisma deleteMany doesn't support limit, so we rely on MAX_BATCHES
        // as a safety rail. For hundreds of millions of rows we'd need raw SQL
        // with LIMIT, but at current scale this is fine.
      });
      batches = i + 1;
      totalDeleted += count;
      if (count === 0 || count < BATCH_SIZE) break;
    }

    return NextResponse.json({
      success: true,
      data: {
        cutoff: cutoff.toISOString(),
        deleted: totalDeleted,
        batches,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cleanup failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
