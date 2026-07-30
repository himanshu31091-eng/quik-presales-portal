import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, notFound, validationError, fail } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";

const withEngagementAuth = withOrgAuthForModule("engagements");

/**
 * Demo delivery tracking.
 *
 * `PsDemo` is a reusable *library* (industry × technology × asset) with no link
 * to an engagement, so on its own it cannot answer "which demo went to which
 * customer, when, presented by whom, and how did it land". That per-opportunity
 * record is what this route adds.
 *
 * Deliberately built on `PsTimelineEvent` rather than new columns: adding fields
 * to PsDemo means editing packages/database, which app teams cannot do. The
 * timeline already carries `engagementId`, an actor, a timestamp and a JSON
 * payload, which is exactly the shape a delivery record needs. If scheduling
 * (future-dated demos, invitations, calendar) is ever approved, it wants real
 * columns — this is the record of what happened, not a scheduler.
 *
 * Two leadership metrics were reading data nobody wrote, and this is their
 * source:
 *   - the weekly report's `demosDelivered` counts `demo-delivered` events
 *   - the dashboard's `demoSatisfaction` and the weekly demo-performance table
 *     average `PsDemo.feedbackScore`, which had no write path at all
 */

/** Event type the weekly report already counts. Do not rename. */
const DEMO_EVENT_TYPE = "demo-delivered";

const logSchema = z.object({
  /** Optional soft reference to the library asset that was presented. */
  demoId: z.string().min(1).optional(),
  /** Defaults to now. Accepts a past date for back-filling. */
  deliveredAt: z.string().datetime().optional(),
  /** Free text so an org is not boxed in by the suggested vocabulary. */
  technology: z.string().max(60).optional(),
  audience: z.array(z.string().min(1).max(120)).max(25).default([]),
  presenterId: z.string().max(64).optional(),
  notes: z.string().max(4000).optional(),
  /** Customer satisfaction, 1-5. Feeds the demo-quality KPI. */
  feedbackScore: z.number().min(1).max(5).optional(),
  outcome: z.enum(["positive", "neutral", "negative", "no-decision"]).default("neutral"),
});

/**
 * POST /api/engagements/[id]/demos — record a demo that was delivered.
 *
 * When both `demoId` and `feedbackScore` are given, the library asset's running
 * average is updated in the same transaction, so the asset accumulates a real
 * satisfaction score across every engagement it is used in.
 */
export const POST = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "update");
    if (denied) return denied;

    const parsed = logSchema.safeParse((await req.json().catch(() => null)) ?? {});
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!engagement) return notFound("Engagement");

    // A demo delivered in the future is a schedule, not a record. Reject it
    // rather than silently skewing this week's counts.
    const deliveredAt = input.deliveredAt ? new Date(input.deliveredAt) : new Date();
    if (deliveredAt.getTime() > Date.now() + 60_000) {
      return fail(400, "deliveredAt cannot be in the future — this records a delivered demo");
    }

    let demo: { id: string; title: string; technology: string; feedbackScore: number | null; feedbackCount: number } | null =
      null;
    if (input.demoId) {
      demo = await db.psDemo.findFirst({
        where: { id: input.demoId, orgId, deletedAt: null },
        select: { id: true, title: true, technology: true, feedbackScore: true, feedbackCount: true },
      });
      if (!demo) return notFound("Demo");
    }

    const result = await db.$transaction(async (tx) => {
      let newAverage: number | null = null;

      if (demo && input.feedbackScore !== undefined) {
        // Running mean over feedbackCount, so the stored average stays correct
        // without keeping every individual rating.
        const previousTotal = (demo.feedbackScore ?? 0) * demo.feedbackCount;
        const nextCount = demo.feedbackCount + 1;
        newAverage = Number(((previousTotal + input.feedbackScore) / nextCount).toFixed(2));

        await tx.psDemo.update({
          where: { id: demo.id },
          data: { feedbackScore: newAverage, feedbackCount: nextCount, updatedBy: userId },
        });
      }

      const summary = demo
        ? `Delivered "${demo.title}" demo`
        : `Delivered a ${input.technology ?? "product"} demo`;

      await writeTimeline(tx, {
        orgId,
        engagementId: engagement.id,
        type: DEMO_EVENT_TYPE,
        actorId: userId,
        summary:
          input.feedbackScore !== undefined
            ? `${summary} — rated ${input.feedbackScore}/5`
            : summary,
        payload: {
          demoId: demo?.id ?? null,
          demoTitle: demo?.title ?? null,
          technology: input.technology ?? demo?.technology ?? null,
          deliveredAt: deliveredAt.toISOString(),
          audience: input.audience,
          presenterId: input.presenterId ?? userId,
          outcome: input.outcome,
          ...(input.feedbackScore !== undefined ? { feedbackScore: input.feedbackScore } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });

      await writeAudit(tx, {
        orgId,
        userId,
        action: "engagement.demo_delivered",
        resource: engagement.id,
        metadata: {
          demoId: demo?.id ?? null,
          outcome: input.outcome,
          ...(input.feedbackScore !== undefined ? { feedbackScore: input.feedbackScore } : {}),
        },
      });

      return { newAverage };
    });

    return createdSerialized({
      engagementId: engagement.id,
      demoId: demo?.id ?? null,
      deliveredAt: deliveredAt.toISOString(),
      outcome: input.outcome,
      feedbackScore: input.feedbackScore ?? null,
      /** The library asset's updated running average, when one was recorded. */
      demoAverageScore: result.newAverage,
    });
  },
);

/**
 * GET /api/engagements/[id]/demos — every demo delivered for this engagement.
 *
 * Read straight off the timeline, newest first. Not paginated: a single
 * opportunity has a handful of demos, and the caller wants all of them to
 * render a history.
 */
export const GET = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "view");
    if (denied) return denied;

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) return notFound("Engagement");

    const events = await db.psTimelineEvent.findMany({
      where: { orgId, engagementId: engagement.id, type: DEMO_EVENT_TYPE },
      select: { id: true, summary: true, payload: true, actorId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const deliveries = events.map((e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      return {
        id: e.id,
        summary: e.summary,
        loggedBy: e.actorId,
        loggedAt: e.createdAt.toISOString(),
        demoId: typeof p.demoId === "string" ? p.demoId : null,
        demoTitle: typeof p.demoTitle === "string" ? p.demoTitle : null,
        technology: typeof p.technology === "string" ? p.technology : null,
        deliveredAt: typeof p.deliveredAt === "string" ? p.deliveredAt : e.createdAt.toISOString(),
        audience: Array.isArray(p.audience) ? (p.audience as string[]) : [],
        presenterId: typeof p.presenterId === "string" ? p.presenterId : null,
        outcome: typeof p.outcome === "string" ? p.outcome : "neutral",
        feedbackScore: typeof p.feedbackScore === "number" ? p.feedbackScore : null,
        notes: typeof p.notes === "string" ? p.notes : null,
      };
    });

    const rated = deliveries.filter((d) => d.feedbackScore !== null);

    return okSerialized({
      deliveries,
      summary: {
        total: deliveries.length,
        averageScore:
          rated.length > 0
            ? Number(
                (rated.reduce((s, d) => s + (d.feedbackScore ?? 0), 0) / rated.length).toFixed(2),
              )
            : null,
        byOutcome: deliveries.reduce<Record<string, number>>((acc, d) => {
          acc[d.outcome] = (acc[d.outcome] ?? 0) + 1;
          return acc;
        }, {}),
      },
    });
  },
);
