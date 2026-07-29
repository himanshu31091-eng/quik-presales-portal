import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, notFound, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { computeLineAmount, parsePaise, sumAmounts } from "@/lib/estimates/money";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withEstimateAuth = withOrgAuthForModule("estimates");

const lineSchema = z.object({
  description: z.string().min(1, "Line description is required").max(500),
  role: z.string().max(120).optional(),
  quantity: z.number().min(0).max(1_000_000),
  unit: z.string().max(40).optional(),
  /** Paise, as a decimal string. */
  rate: z.string().regex(/^\d{1,18}$/, "rate must be a whole number of paise"),
});

const createSchema = z.object({
  engagementId: z.string().min(1, "engagementId is required"),
  title: z.string().min(2, "Title must be at least 2 characters").max(160),
  currency: z.string().length(3).default("INR"),
  assumptions: z.string().max(20_000).optional(),
  lines: z.array(lineSchema).max(500).default([]),
});

const listQuery = z.object({
  engagementId: z.string().optional(),
  status: z.enum(["draft", "final"]).optional(),
});

/** GET /api/estimates */
export const GET = withEstimateAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "estimates", "view");
  if (denied) return denied;

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where: Prisma.PsCostEstimateWhereInput = {
    orgId,
    ...(parsed.data.engagementId && { engagementId: parsed.data.engagementId }),
    ...(parsed.data.status && { status: parsed.data.status }),
  };

  const [items, total] = await Promise.all([
    db.psCostEstimate.findMany({
      where,
      select: {
        id: true,
        engagementId: true,
        title: true,
        currency: true,
        totalAmount: true,
        status: true,
        updatedAt: true,
        _count: { select: { lines: true } },
      },
      orderBy: { updatedAt: "desc" },
      ...paginationToSkipTake(pagination),
    }),
    db.psCostEstimate.count({ where }),
  ]);

  return okSerialized(buildPaginationResponse(items, total, pagination));
});

/**
 * POST /api/estimates — create with lines.
 *
 * Line amounts and the estimate total are computed here from `rate × quantity`.
 * The client never supplies an amount or a total: accepting one would let a
 * bad or malicious payload produce an estimate whose lines don't sum to its
 * headline figure.
 */
export const POST = withEstimateAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "estimates", "create");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const { engagementId, title, currency, assumptions, lines } = parsed.data;

  const engagement = await db.psEngagement.findFirst({
    where: { id: engagementId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!engagement) return notFound("Engagement");

  const computed = lines.map((line, index) => {
    const rate = parsePaise(line.rate) ?? 0n;
    return {
      description: line.description,
      role: line.role,
      quantity: line.quantity,
      unit: line.unit,
      rate,
      amount: computeLineAmount(rate, line.quantity),
      sortOrder: index,
    };
  });

  const totalAmount = sumAmounts(computed.map((l) => l.amount));

  const estimate = await db.$transaction(async (tx) => {
    const row = await tx.psCostEstimate.create({
      data: {
        orgId,
        engagementId: engagement.id,
        title,
        currency,
        assumptions,
        totalAmount,
        createdBy: userId,
        updatedBy: userId,
        lines: { create: computed.map((l) => ({ orgId, ...l })) },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });

    await writeTimeline(tx, {
      orgId,
      engagementId: engagement.id,
      type: "estimate-created",
      actorId: userId,
      summary: `Created estimate "${title}"`,
      payload: { estimateId: row.id },
    });
    await writeAudit(tx, { orgId, userId, action: "estimate.create", resource: row.id });

    return row;
  });

  return createdSerialized(estimate);
});
