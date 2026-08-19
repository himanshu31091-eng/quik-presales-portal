import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { STAGE_LABEL, type Stage } from "@/lib/pipeline";

const withDashboardAuth = withOrgAuthForModule("dashboard");

/** Open this long in one stage without moving and it's flagged as stuck. */
const STUCK_THRESHOLD_DAYS = 14;

/**
 * GET /api/team — leadership rollup: who's working on what, how much
 * progress each person is making, and what's stuck.
 *
 * `salesOwnerId`/`presalesOwnerId`/`actorId` are soft references (no Prisma
 * relation, same convention as `crmOpportunityId`), so names are resolved
 * with a separate lookup rather than an `include`.
 *
 * Bounded by the org's total engagement/timeline volume, not paginated —
 * same tradeoff the main dashboard makes for its practice-pipeline bucket,
 * which is fetched and grouped in memory rather than in SQL.
 */
export const GET = withDashboardAuth(async ({ orgId, userId }) => {
  const denied = await requirePermission(userId, orgId, "dashboard", "view");
  if (denied) return denied;

  const [engagements, recentActivity] = await Promise.all([
    db.psEngagement.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true,
        title: true,
        stage: true,
        closedStatus: true,
        salesOwnerId: true,
        presalesOwnerId: true,
        estRevenue: true,
        currency: true,
        updatedAt: true,
      },
    }),
    db.psTimelineEvent.findMany({
      where: { orgId },
      select: {
        id: true,
        type: true,
        summary: true,
        actorId: true,
        createdAt: true,
        engagement: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // One owner per engagement for attribution purposes: whoever is currently
  // driving it (presales, once assigned) takes precedence over whoever
  // originated it (sales) — matches the fallback already used on the
  // Engagements list ("presalesOwnerName ?? salesOwnerName").
  const ownerOf = (e: { salesOwnerId: string | null; presalesOwnerId: string | null }) =>
    e.presalesOwnerId ?? e.salesOwnerId ?? null;

  const userIds = [
    ...new Set([
      ...engagements.map(ownerOf).filter((v): v is string => !!v),
      ...recentActivity.map((a) => a.actorId).filter((v): v is string => !!v),
    ]),
  ];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  interface PersonStats {
    id: string;
    name: string;
    active: number;
    stuck: number;
    won: number;
    lost: number;
    rejected: number;
  }
  const people = new Map<string, PersonStats>();

  function personRow(id: string): PersonStats {
    let row = people.get(id);
    if (!row) {
      row = { id, name: nameOf.get(id) ?? "Unknown", active: 0, stuck: 0, won: 0, lost: 0, rejected: 0 };
      people.set(id, row);
    }
    return row;
  }

  const stuckDeals: {
    id: string;
    title: string;
    stage: string;
    stageLabel: string;
    idleDays: number;
    ownerId: string | null;
    ownerName: string | null;
    estRevenue: string | null;
    currency: string | null;
  }[] = [];

  // The stored `daysInStage` counter is never incremented as real time
  // passes (only set at creation/transition, see lib/pipeline.ts) — it reads
  // 0 for a deal untouched in weeks as often as for one from this morning.
  // `updatedAt`, which Prisma maintains on every write, is the live signal.
  const now = Date.now();

  for (const e of engagements) {
    const ownerId = ownerOf(e);
    const idleDays = Math.floor((now - e.updatedAt.getTime()) / 86_400_000);
    // Per-person stats only make sense when there's a person to attribute to —
    // but an unowned deal going stale is exactly what leadership most needs
    // to see, so stuck-deal detection below runs regardless of ownership.
    const row = ownerId ? personRow(ownerId) : null;

    if (e.closedStatus === "open") {
      if (row) row.active += 1;
      if (idleDays > STUCK_THRESHOLD_DAYS) {
        if (row) row.stuck += 1;
        stuckDeals.push({
          id: e.id,
          title: e.title,
          stage: e.stage,
          stageLabel: STAGE_LABEL[e.stage as Stage] ?? e.stage,
          idleDays,
          ownerId,
          ownerName: ownerId ? (nameOf.get(ownerId) ?? null) : null,
          estRevenue: e.estRevenue?.toString() ?? null,
          currency: e.currency,
        });
      }
    } else if (row) {
      if (e.closedStatus === "won") row.won += 1;
      else if (e.closedStatus === "lost") row.lost += 1;
      else if (e.closedStatus === "rejected") row.rejected += 1;
    }
  }

  stuckDeals.sort((a, b) => b.idleDays - a.idleDays);

  return okSerialized({
    stuckThresholdDays: STUCK_THRESHOLD_DAYS,
    people: [...people.values()].sort((a, b) => b.active - a.active),
    stuckDeals: stuckDeals.slice(0, 25),
    recentActivity: recentActivity.map((a) => ({
      ...a,
      actorName: a.actorId ? (nameOf.get(a.actorId) ?? null) : null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});
