import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRedisAvailable } from "@quikit/redis";
import { db } from "@/lib/db";

// A readiness probe must execute on every request. Without this Next
// prerenders it at build time and bakes in whatever verdict the build machine
// saw — which is a frozen "degraded" if the build had no database.
export const dynamic = "force-dynamic";

/**
 * GET /api/health/ready — readiness probe.
 *
 * Distinct from /api/health (liveness): this one actually touches the
 * dependencies, so an orchestrator can stop routing traffic to a pod whose
 * database is unreachable.
 *
 *   1. PostgreSQL via `$queryRaw`
 *   2. Redis via PING — optional; passes when REDIS_URL is unset, because the
 *      cache layer fails open by design
 *
 * 200 when everything passes, 503 otherwise. Per-check detail (including error
 * strings, which can leak topology) is only returned to a caller holding
 * HEALTH_TOKEN. Mirrors apps/quikscale/app/api/health/ready.
 */
export async function GET(request: NextRequest) {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  const dbStart = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    checks.postgres = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (error: unknown) {
    checks.postgres = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "DB unreachable",
    };
  }

  const redisStart = Date.now();
  try {
    const available = await isRedisAvailable();
    const redisConfigured = !!process.env.REDIS_URL;
    checks.redis = {
      ok: redisConfigured ? available : true,
      latencyMs: Date.now() - redisStart,
      ...(redisConfigured ? {} : { error: "REDIS_URL not set (optional)" }),
    };
  } catch (error: unknown) {
    checks.redis = {
      ok: false,
      latencyMs: Date.now() - redisStart,
      error: error instanceof Error ? error.message : "Redis unreachable",
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  const token = process.env.HEALTH_TOKEN;
  const auth = request.headers.get("authorization");
  const showDetails = !!token && auth === `Bearer ${token}`;

  return NextResponse.json(
    {
      status: allOk ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
      ...(showDetails ? { checks } : {}),
    },
    { status: allOk ? 200 : 503 },
  );
}
