import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, notFound, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { DEFAULT_SECTIONS, normaliseSections, type ProposalSection } from "@/lib/proposals/sections";
import { PROPOSAL_STATUSES } from "@/lib/proposals/status";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withProposalAuth = withOrgAuthForModule("proposals");

const listQuery = z.object({
  engagementId: z.string().optional(),
  status: z.enum(PROPOSAL_STATUSES).optional(),
  search: z.string().max(120).optional(),
});

const createSchema = z.object({
  engagementId: z.string().min(1, "engagementId is required"),
  title: z.string().min(2, "Title must be at least 2 characters").max(160),
  rfpId: z.string().optional(),
  /** Seed section titles from a template instead of the default skeleton. */
  templateId: z.string().optional(),
});

const LIST_SELECT = {
  id: true,
  engagementId: true,
  rfpId: true,
  title: true,
  status: true,
  currentVersionId: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { versions: true } },
} satisfies Prisma.PsProposalSelect;

/** GET /api/proposals — paginated list. */
export const GET = withProposalAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "proposals", "view");
  if (denied) return denied;

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { engagementId, status, search } = parsed.data;

  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where: Prisma.PsProposalWhereInput = {
    orgId,
    ...(engagementId && { engagementId }),
    ...(status && { status }),
    ...(search && { title: { contains: search, mode: "insensitive" as const } }),
  };

  const [items, total] = await Promise.all([
    db.psProposal.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { updatedAt: "desc" },
      ...paginationToSkipTake(pagination),
    }),
    db.psProposal.count({ where }),
  ]);

  return okSerialized(buildPaginationResponse(items, total, pagination));
});

/**
 * POST /api/proposals — create a proposal with an empty v1.
 *
 * Every proposal gets a version immediately so `currentVersionId` is never
 * null downstream — the editor, exporters and version history can all assume
 * a current version exists.
 */
export const POST = withProposalAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "proposals", "create");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const { engagementId, title, rfpId, templateId } = parsed.data;

  const engagement = await db.psEngagement.findFirst({
    where: { id: engagementId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!engagement) return notFound("Engagement");

  if (rfpId) {
    const rfp = await db.psRfp.findFirst({
      where: { id: rfpId, orgId, engagementId: engagement.id },
      select: { id: true },
    });
    if (!rfp) return notFound("RFP");
  }

  let skeleton: ProposalSection[] = DEFAULT_SECTIONS.map((s) => ({ ...s, html: "" }));

  if (templateId) {
    const template = await db.psTemplate.findFirst({
      where: { id: templateId, orgId, deletedAt: null },
      select: { content: true },
    });
    if (!template) return notFound("Template");

    // A template's `content` is free-form JSON; only use it when it actually
    // carries a usable section list, otherwise fall back to the default.
    const fromTemplate = Array.isArray(template.content)
      ? (template.content as unknown[]).flatMap((item): ProposalSection[] => {
          const row = item as { slug?: unknown; title?: unknown; html?: unknown };
          if (typeof row?.slug !== "string" || typeof row?.title !== "string") return [];
          return [
            {
              slug: row.slug,
              title: row.title,
              html: typeof row.html === "string" ? row.html : "",
            },
          ];
        })
      : [];
    if (fromTemplate.length > 0) skeleton = fromTemplate;
  }

  const sections = normaliseSections(skeleton);

  const proposal = await db.$transaction(async (tx) => {
    const row = await tx.psProposal.create({
      data: {
        orgId,
        engagementId: engagement.id,
        rfpId,
        title,
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true },
    });

    const version = await tx.psProposalVersion.create({
      data: {
        orgId,
        proposalId: row.id,
        version: 1,
        sections: sections as unknown as Prisma.InputJsonValue,
        changeNote: templateId ? "Created from template" : "Created",
        source: "edit",
        createdBy: userId,
      },
      select: { id: true },
    });

    const withVersion = await tx.psProposal.update({
      where: { id: row.id },
      data: { currentVersionId: version.id },
      select: LIST_SELECT,
    });

    await writeTimeline(tx, {
      orgId,
      engagementId: engagement.id,
      type: "proposal-created",
      actorId: userId,
      summary: `Created proposal "${title}"`,
      payload: { proposalId: row.id },
    });
    await writeAudit(tx, { orgId, userId, action: "proposal.create", resource: row.id });

    return withVersion;
  });

  return createdSerialized(proposal);
});
