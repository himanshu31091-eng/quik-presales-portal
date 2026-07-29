import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import StatCard from "@/components/dashboard/stat-card";
import { Users, UsersRound, Mail, LayoutGrid } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { cacheGet, cacheSet, CacheKeys, DASHBOARD_STATS_CACHE_TTL } from "@/lib/redis";

interface Stats {
  members: number;
  teams: number;
  invites: number;
  apps: number;
}

/**
 * Dashboard overview. Server-rendered so the stat cards paint with real
 * numbers on first byte — the user doesn't see a row of zeros while a
 * client-side fetch is in flight. The same Redis cache (30s TTL) backs
 * both this page and `/api/dashboard/stats`, so a fresh visit and an
 * API hit share the same cached value.
 */
async function fetchStats(orgId: string): Promise<Stats> {
  const cacheKey = CacheKeys.dashboardStats(orgId);
  const cached = await cacheGet<Stats>(cacheKey).catch(() => null);
  if (cached) return cached;

  const [members, teams, invites, appCount] = await Promise.all([
    db.orgMember.count({ where: { orgId, status: "active" } }),
    db.team.count({ where: { orgId } }),
    db.orgMember.count({ where: { orgId, status: "invited" } }),
    db.userAppAccess.groupBy({ by: ["appId"], where: { orgId } }),
  ]);

  const stats: Stats = { members, teams, invites, apps: appCount.length };
  await cacheSet(cacheKey, stats, DASHBOARD_STATS_CACHE_TTL).catch(() => {});
  return stats;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  // The dashboard layout already redirects on missing session/orgId, but we
  // defend here so a direct deep-link can't crash the server query.
  if (!session?.user?.id || !session.user.orgId) {
    redirect("/login");
  }

  const stats = await fetchStats(session.user.orgId).catch(
    () => ({ members: 0, teams: 0, invites: 0, apps: 0 } satisfies Stats),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Overview</h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
          Organisation management at a glance
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Members"
          value={stats.members}
          icon={<Users className="h-5 w-5" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
        />
        <StatCard
          label="Teams"
          value={stats.teams}
          icon={<UsersRound className="h-5 w-5" />}
          iconBg="bg-green-50"
          iconColor="text-green-500"
        />
        <StatCard
          label="Pending Invites"
          value={stats.invites}
          icon={<Mail className="h-5 w-5" />}
          iconBg="bg-amber-50"
          iconColor="text-amber-500"
        />
        <StatCard
          label="Apps"
          value={stats.apps}
          icon={<LayoutGrid className="h-5 w-5" />}
          iconBg="bg-purple-50"
          iconColor="text-purple-500"
        />
      </div>
    </div>
  );
}
