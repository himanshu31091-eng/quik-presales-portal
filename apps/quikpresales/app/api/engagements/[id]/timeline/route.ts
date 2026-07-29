import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, notFound, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withEngagementAuth = withOrgAuthForModule("engagements");

const noteSchema = z.object({
  type: z.string().min(1).max(40).default("note"),
  summary: z.string().min(1, "Summary is required").max(500),
  payload: z.record(z.unknown()).optional(),
  visibility: z.enum(["internal", "customer"]).default("internal"),
});

/**
 * Confirm the engagement exists inside the caller's org before touching its
 * children. Without this the child query would still be org-filtered, but a
 * cross-org id would return an empty list rather than a 404 — which leaks
 * whether the id exists.
 */
async function engagementInOrg(id: string, orgId: string) {
  return db.psEngagement.findFirst({
    where: { id, orgId, deletedAt: null },
    select: { id: true },
  });
}

/** GET /api/engagements/[id]/timeline — paginated, newest first. */
export const GET = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "view");
    if (denied) return denied;

    const engagement = await engagementInOrg(params.id, orgId);
    if (!engagement) return notFound("Engagement");

    const pagination = parsePaginationParams(req.nextUrl.searchParams);
    const where = { orgId, engagementId: engagement.id };

    const [items, total] = await Promise.all([
      db.psTimelineEvent.findMany({
        where,
        select: {
          id: true,
          type: true,
          actorId: true,
          summary: true,
          payload: true,
          visibility: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        ...paginationToSkipTake(pagination),
      }),
      db.psTimelineEvent.count({ where }),
    ]);

    return okSerialized(buildPaginationResponse(items, total, pagination));
  },
);

/** POST /api/engagements/[id]/timeline — add a manual note. */
export const POST = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "update");
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const engagement = await engagementInOrg(params.id, orgId);
    if (!engagement) return notFound("Engagement");

    const event = await db.$transaction(async (tx) => {
      const row = await tx.psTimelineEvent.create({
        data: {
          orgId,
          engagementId: engagement.id,
          type: parsed.data.type,
          actorId: userId,
          summary: parsed.data.summary,
          payload: parsed.data.payload as never,
          visibility: parsed.data.visibility,
        },
      });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "engagement.timeline.create",
        resource: engagement.id,
        metadata: { eventId: row.id, type: row.type },
      });
      return row;
    });

    return createdSerialized(event);
  },
);
