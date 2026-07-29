import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withWinLossAuth = withOrgAuthForModule("winloss");

const listQuery = z.object({
  outcome: z.enum(["won", "lost"]).optional(),
  competitor: z.string().max(120).optional(),
});

const upsertSchema = z.object({
  engagementId: z.string().min(1, "engagementId is required"),
  outcome: z.enum(["won", "lost"]),
  competitor: z.string().max(120).optional(),
  reasonCategory: z.string().max(120).optional(),
  reasonText: z.string().max(20_000).optional(),
  lessons: z.string().max(20_000).optional(),
  /** Paise. */
  dealSize: z.string().regex(/^\d{1,18}$/, "dealSize must be whole paise").optional(),
});

/** GET /api/winloss — records plus a reason/competitor rollup for the analysis view. */
export const GET = withWinLossAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "winloss", "view");
  if (denied) return denied;

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where: Prisma.PsWinLossWhereInput = {
    orgId,
    ...(parsed.data.outcome && { outcome: parsed.data.outcome }),
    ...(parsed.data.competitor && { competitor: parsed.data.competitor }),
  };

  const [items, total, byOutcome, byReason] = await Promise.all([
    db.psWinLoss.findMany({
      where,
      select: {
        id: true,
        engagementId: true,
        outcome: true,
        competitor: true,
        reasonCategory: true,
        reasonText: true,
        lessons: true,
        dealSize: true,
        createdAt: true,
        engagement: { select: { title: true, industry: true } },
      },
      orderBy: { createdAt: "desc" },
      ...paginationToSkipTake(pagination),
    }),
    db.psWinLoss.count({ where }),
    // Rollups intentionally span the whole org, not the current filter — the
    // analysis panel is a constant reference while the user filters the list.
    db.psWinLoss.groupBy({ by: ["outcome"], where: { orgId }, _count: true }),
    db.psWinLoss.groupBy({
      by: ["reasonCategory"],
      where: { orgId, NOT: { reasonCategory: null } },
      _count: true,
    }),
  ]);

  return okSerialized({
    ...buildPaginationResponse(items, total, pagination),
    analysis: {
      byOutcome: Object.fromEntries(byOutcome.map((r) => [r.outcome, r._count])),
      byReason: Object.fromEntries(
        byReason.map((r) => [r.reasonCategory ?? "unspecified", r._count]),
      ),
    },
  });
});

/**
 * POST /api/winloss — record the outcome of an engagement.
 *
 * One record per engagement (enforced by a unique constraint), so a repeat
 * POST updates the existing row rather than 409-ing — this is the "capture
 * win/loss" form being re-submitted, not a duplicate resource.
 */
export const POST = withWinLossAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "winloss", "create");
  if (denied) return denied;

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const { engagementId, outcome, dealSize, ...rest } = parsed.data;

  const engagement = await db.psEngagement.findFirst({
    where: { id: engagementId, orgId, deletedAt: null },
    select: { id: true, title: true, closedStatus: true },
  });
  if (!engagement) return notFound("Engagement");

  // The engagement's own stage machine owns won/lost. Recording a contradictory
  // outcome here would make the dashboard disagree with the pipeline.
  if (engagement.closedStatus !== outcome) {
    return fail(
      409,
      engagement.closedStatus === "open"
        ? `Engagement is still open. Move it to ${outcome} first via /api/engagements/${engagement.id}/transition.`
        : `Engagement is recorded as ${engagement.closedStatus}, not ${outcome}.`,
    );
  }

  const existing = await db.psWinLoss.findFirst({
    where: { orgId, engagementId: engagement.id },
    select: { id: true },
  });

  const data = {
    ...rest,
    outcome,
    dealSize: dealSize ? BigInt(dealSize) : null,
    capturedById: userId,
  };

  const record = await db.$transaction(async (tx) => {
    const row = existing
      ? await tx.psWinLoss.update({ where: { id: existing.id }, data })
      : await tx.psWinLoss.create({ data: { orgId, engagementId: engagement.id, ...data } });

    await writeTimeline(tx, {
      orgId,
      engagementId: engagement.id,
      type: "winloss-captured",
      actorId: userId,
      summary: `Recorded ${outcome} for "${engagement.title}"`,
      payload: { winLossId: row.id, outcome, competitor: rest.competitor },
    });
    await writeAudit(tx, {
      orgId,
      userId,
      action: existing ? "winloss.update" : "winloss.create",
      resource: row.id,
    });

    return row;
  });

  return existing ? okSerialized(record) : createdSerialized(record);
});
