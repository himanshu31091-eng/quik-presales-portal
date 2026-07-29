import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getMetrics, getContentType } from "@/lib/observability/metrics";

// Gauges are read live per scrape; never prerender or cache them.
export const dynamic = "force-dynamic";

/**
 * GET /api/metrics — Prometheus scrape endpoint.
 *
 * Fails CLOSED: with METRICS_TOKEN unset the endpoint 403s rather than serving
 * openly, so operational data is never exposed by an incomplete deployment.
 * The scraper passes `Authorization: Bearer <token>`.
 *
 * Mirrors apps/quikinfra and apps/quikscale.
 */
export async function GET(request: NextRequest) {
  const token = process.env.METRICS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Metrics endpoint not configured" }, { status: 403 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metrics = await getMetrics();
  return new NextResponse(metrics, {
    status: 200,
    headers: { "Content-Type": getContentType(), "Cache-Control": "no-store" },
  });
}
