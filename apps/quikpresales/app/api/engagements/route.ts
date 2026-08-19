import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { isStage, STAGE_PROBABILITY } from "@/lib/pipeline";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withEngagementAuth = withOrgAuthForModule("engagements");

const listQuery = z.object({
  stage: z.string().refine((v) => isStage(v), "Unknown stage").optional(),
  closedStatus: z.enum(["open", "won", "lost"]).optional(),
  presalesOwnerId: z.string().optional(),
  search: z.string().max(120).optional(),
  industry: z.string().max(80).optional(),
  /** Expected-close range, inclusive — either end optional. */
  closeFrom: z.string().datetime().optional(),
  closeTo: z.string().datetime().optional(),
  /** Either ownership field matching the caller — "my pipeline" view. */
  mine: z.enum(["true", "false"]).optional(),
});

const createSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(160),
  industry: z.string().max(80).optional(),
  territory: z.string().max(80).optional(),
  salesOwnerId: z.string().optional(),
  presalesOwnerId: z.string().optional(),
  // Money arrives as a decimal string so JS never sees it as a lossy Number.
  estRevenue: z
    .string()
    .regex(/^\d+$/, "estRevenue must be a whole number of paise")
    .optional(),
  currency: z.string().length(3).optional(),
  expectedClose: z.string().datetime().optional(),
  competitors: z.array(z.string().max(80)).max(20).optional(),
  techStack: z.array(z.string().max(80)).max(30).optional(),
  crmOpportunityId: z.string().max(64).optional(),
  crmAccountId: z.string().max(64).optional(),
  crmLeadId: z.string().max(64).optional(),
});

const LIST_SELECT = {
  id: true,
  title: true,
  industry: true,
  stage: true,
  closedStatus: true,
  estRevenue: true,
  currency: true,
  probability: true,
  presalesOwnerId: true,
  salesOwnerId: true,
  expectedClose: true,
  aiDealHealth: true,
  daysInStage: true,
  updatedAt: true,
} satisfies Prisma.PsEngagementSelect;

/** GET /api/engagements — paginated, org-scoped list. */
export const GET = withEngagementAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "engagements", "view");
  if (denied) return denied;

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { stage, closedStatus, presalesOwnerId, search, industry, closeFrom, closeTo, mine } = parsed.data;

  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where: Prisma.PsEngagementWhereInput = {
    orgId,
    deletedAt: null,
    ...(stage && { stage }),
    ...(closedStatus && { closedStatus }),
    ...(presalesOwnerId && { presalesOwnerId }),
    ...(search && { title: { contains: search, mode: "insensitive" as const } }),
    ...(industry && { industry }),
    ...((closeFrom || closeTo) && {
      expectedClose: {
        ...(closeFrom && { gte: new Date(closeFrom) }),
        ...(closeTo && { lte: new Date(closeTo) }),
      },
    }),
    // Either ownership role counts as "mine" — a solution architect who
    // inherited a deal from sales still needs to find it here.
    ...(mine === "true" && { OR: [{ salesOwnerId: userId }, { presalesOwnerId: userId }] }),
  };

  const [items, total] = await Promise.all([
    db.psEngagement.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      ...paginationToSkipTake(pagination),
    }),
    db.psEngagement.count({ where }),
  ]);

  // salesOwnerId/presalesOwnerId are soft references (no Prisma relation, same
  // as crmOpportunityId) — resolve display names with one extra lookup rather
  // than shipping bare ids the UI can't render anything useful from.
  const ownerIds = [
    ...new Set(items.flatMap((e) => [e.salesOwnerId, e.presalesOwnerId]).filter((v): v is string => !!v)),
  ];
  const owners = ownerIds.length
    ? await db.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, `${o.firstName} ${o.lastName}`.trim()]));

  // `daysInStage` is a stored counter nothing increments as real time passes
  // (it's only ever set at creation/transition time, see lib/pipeline.ts) —
  // it reads 0 for a deal untouched in weeks just as often as for one from
  // this morning. `idleDays`, computed live from `updatedAt` (which Prisma
  // maintains on every write), is what "stuck" actually needs.
  const now = Date.now();
  const withNames = items.map((e) => ({
    ...e,
    idleDays: Math.floor((now - e.updatedAt.getTime()) / 86_400_000),
    salesOwnerName: e.salesOwnerId ? (ownerName.get(e.salesOwnerId) ?? null) : null,
    presalesOwnerName: e.presalesOwnerId ? (ownerName.get(e.presalesOwnerId) ?? null) : null,
  }));

  return okSerialized(buildPaginationResponse(withNames, total, pagination));
});

/** POST /api/engagements — create. */
export const POST = withEngagementAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "engagements", "create");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { estRevenue, expectedClose, competitors, techStack, ...rest } = parsed.data;

  const engagement = await db.$transaction(async (tx) => {
    const row = await tx.psEngagement.create({
      data: {
        ...rest,
        orgId,
        createdBy: userId,
        updatedBy: userId,
        estRevenue: estRevenue ? BigInt(estRevenue) : null,
        expectedClose: expectedClose ? new Date(expectedClose) : null,
        competitors: competitors ?? [],
        techStack: techStack ?? [],
        probability: STAGE_PROBABILITY.qualification,
      },
      select: LIST_SELECT,
    });

    await writeTimeline(tx, {
      orgId,
      engagementId: row.id,
      type: "created",
      actorId: userId,
      summary: `Created engagement "${row.title}"`,
    });
    await writeAudit(tx, {
      orgId,
      userId,
      action: "engagement.create",
      resource: row.id,
      metadata: { title: row.title },
    });

    return row;
  });

  return createdSerialized(engagement);
});
