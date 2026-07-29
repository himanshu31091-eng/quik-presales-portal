import { NextResponse } from "next/server";

/**
 * GET /api/health — liveness / startup probe.
 *
 * Point GCP's startup AND liveness probes here (Cloud Run health check,
 * GKE livenessProbe, or a Load Balancer health check).
 *
 * INTENTIONALLY has zero dependencies — no DB, no auth, no session. A
 * liveness probe that touches the database creates a restart loop: a
 * transient DB blip fails the probe, GCP kills the container, the new
 * container also can't reach the DB, and the service "never gets up."
 * Liveness answers one question only: "is the Node process serving HTTP?"
 *
 * Use /api/health/ready for the DB-backed readiness check that gates
 * traffic without killing the container.
 *
 * `force-dynamic` so Next never statically optimizes or caches this — the
 * probe must hit the running process every time.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "quikit",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    },
  );
}
