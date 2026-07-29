/**
 * SA-A.4 — App uptime probe.
 *
 * For each active App in the registry, pings `<baseUrl>/api/health` and
 * records the outcome in AppHealthCheck. Runs every 5 minutes on Vercel
 * (add to vercel.json crons).
 *
 * Each probe is bounded by an 8-second timeout so one dead app doesn't
 * stall the whole cron run. Results are written sequentially but the
 * actual HTTP fetches run in parallel.
 *
 * App authors must expose `GET /api/health` returning 200 with a JSON
 * body to be considered "up". Any non-2xx, timeout, or network error
 * → "down". 3xx responses → "degraded".
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCronOrSuperAdmin } from "@/lib/requireCronOrSuperAdmin";
import { requireProdEnv } from "@quikit/shared/env";

const TIMEOUT_MS = 8_000;

interface ProbeResult {
  appId: string;
  status: "up" | "down" | "degraded";
  statusCode: number | null;
  durationMs: number | null;
  error: string | null;
}

async function probeApp(app: { id: string; slug: string; baseUrl: string }): Promise<ProbeResult> {
  // Skip apps whose baseUrl is "/" (that's the launcher itself — same origin)
  // and resolve relative paths by assuming the same host as the current request.
  // For registered external apps baseUrl is absolute.
  let url: URL;
  try {
    const launcherBase = requireProdEnv("QUIKIT_URL", "http://localhost:3000"); // prod-safety-allow: dev fallback, prod throws
    url = new URL("/api/health", app.baseUrl === "/" ? launcherBase : app.baseUrl);
  } catch {
    return { appId: app.id, status: "down", statusCode: null, durationMs: null, error: `Invalid baseUrl: ${app.baseUrl}` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      // Never cache — we need a fresh probe each time.
      cache: "no-store",
    });
    const durationMs = Date.now() - startedAt;
    let status: ProbeResult["status"] = "down";
    if (res.status >= 200 && res.status < 300) status = "up";
    else if (res.status >= 300 && res.status < 400) status = "degraded";

    return { appId: app.id, status, statusCode: res.status, durationMs, error: null };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Network error";
    return { appId: app.id, status: "down", statusCode: null, durationMs, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const { blocked } = await requireCronOrSuperAdmin(req);
  if (blocked) return blocked;

  try {
    const apps = await db.app.findMany({
      where: { status: "active" },
      select: { id: true, slug: true, baseUrl: true },
    });

    const results = await Promise.all(apps.map(probeApp));

    // Sequential writes — low cost at current fleet size (<10 apps).
    for (const r of results) {
      await db.appHealthCheck.create({
        data: {
          appId: r.appId,
          status: r.status,
          statusCode: r.statusCode,
          durationMs: r.durationMs,
          error: r.error?.slice(0, 500) ?? null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        probed: results.length,
        up: results.filter((r) => r.status === "up").length,
        degraded: results.filter((r) => r.status === "degraded").length,
        down: results.filter((r) => r.status === "down").length,
        results: results.map((r) => ({ appId: r.appId, status: r.status, statusCode: r.statusCode, durationMs: r.durationMs })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
