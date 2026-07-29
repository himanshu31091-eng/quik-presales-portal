import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, notFound, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { normaliseSections, parseSections } from "@/lib/proposals/sections";

const withProposalAuth = withOrgAuthForModule("proposals");

const sectionSchema = z.object({
  slug: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  html: z.string().max(200_000),
});

const createSchema = z.object({
  sections: z.array(sectionSchema).min(1, "At least one section is required").max(60),
  changeNote: z.string().max(500).optional(),
  source: z.enum(["claude", "edit", "claude-section"]).default("edit"),
});

/**
 * GET /api/proposals/[id]/versions — version history, newest first.
 *
 * Section bodies are omitted; the list is for the history sidebar. Fetch a
 * single version to read its content.
 */
export const GET = withProposalAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "proposals", "view");
    if (denied) return denied;

    const proposal = await db.psProposal.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, currentVersionId: true },
    });
    if (!proposal) return notFound("Proposal");

    // ?version=N returns that single version, with sections.
    const requested = req.nextUrl.searchParams.get("version");
    if (requested) {
      const n = Number.parseInt(requested, 10);
      if (!Number.isInteger(n) || n < 1) return validationError(
        new z.ZodError([
          { code: "custom", path: ["version"], message: "version must be a positive integer" },
        ]),
      );

      const one = await db.psProposalVersion.findFirst({
        where: { orgId, proposalId: proposal.id, version: n },
      });
      if (!one) return notFound("Version");
      return okSerialized({ ...one, sections: parseSections(one.sections) });
    }

    const versions = await db.psProposalVersion.findMany({
      where: { orgId, proposalId: proposal.id },
      select: {
        id: true,
        version: true,
        changeNote: true,
        source: true,
        createdAt: true,
        createdBy: true,
      },
      orderBy: { version: "desc" },
    });

    return okSerialized({ versions, currentVersionId: proposal.currentVersionId });
  },
);

/**
 * POST /api/proposals/[id]/versions — fork a new immutable version.
 *
 * This is the only way proposal content changes. Existing version rows are
 * never updated, so the history is a true audit trail: what was sent to a
 * customer at approval time stays exactly as it was.
 */
export const POST = withProposalAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "proposals", "update");
    if (denied) return denied;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);

    const proposal = await db.psProposal.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!proposal) return notFound("Proposal");

    const sections = normaliseSections(parsed.data.sections);

    const version = await db.$transaction(async (tx) => {
      // Derive the next number inside the transaction; the
      // @@unique([proposalId, version]) constraint is the real guard against
      // two concurrent saves both claiming the same number.
      const latest = await tx.psProposalVersion.findFirst({
        where: { orgId, proposalId: proposal.id },
        select: { version: true },
        orderBy: { version: "desc" },
      });
      const nextNumber = (latest?.version ?? 0) + 1;

      const row = await tx.psProposalVersion.create({
        data: {
          orgId,
          proposalId: proposal.id,
          version: nextNumber,
          sections: sections as unknown as Prisma.InputJsonValue,
          changeNote: parsed.data.changeNote,
          source: parsed.data.source,
          createdBy: userId,
        },
      });

      await tx.psProposal.update({
        where: { id: proposal.id },
        data: { currentVersionId: row.id, updatedBy: userId },
      });

      await writeAudit(tx, {
        orgId,
        userId,
        action: "proposal.version.create",
        resource: proposal.id,
        metadata: { versionId: row.id, version: nextNumber, source: parsed.data.source },
      });

      return row;
    });

    return createdSerialized({ ...version, sections: parseSections(version.sections) });
  },
);
