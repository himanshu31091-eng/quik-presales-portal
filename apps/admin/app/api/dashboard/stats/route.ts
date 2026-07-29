import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { cacheGet, cacheSet, CacheKeys, DASHBOARD_STATS_CACHE_TTL } from "@/lib/redis";

interface DashboardStats { members: number; teams: number; invites: number; apps: number }

export const GET = withAdminAuth(async ({ orgId }) => {
  const blocked = await gateModuleApi("admin", "overview", orgId);
  if (blocked) return blocked as NextResponse;

  const cacheKey = CacheKeys.dashboardStats(orgId);
  const cached = await cacheGet<DashboardStats>(cacheKey);
  if (cached) return NextResponse.json({ success: true, data: cached });

  const [members, teams, invites, appCount] = await Promise.all([
    db.orgMember.count({ where: { orgId, status: "active" } }),
    db.team.count({ where: { orgId } }),
    db.orgMember.count({ where: { orgId, status: "invited" } }),
    db.userAppAccess.groupBy({ by: ["appId"], where: { orgId } }),
  ]);

  const data: DashboardStats = { members, teams, invites, apps: appCount.length };
  await cacheSet(cacheKey, data, DASHBOARD_STATS_CACHE_TTL);

  return NextResponse.json({ success: true, data });
});
