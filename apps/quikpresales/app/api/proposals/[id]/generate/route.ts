import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { parseSections, normaliseSections, sectionToPlainText } from "@/lib/proposals/sections";
import { generateProposalSection, type SectionContext } from "@/lib/ai/prompts/generate-section";

const withProposalAuth = withOrgAuthForModule("proposals");

/**
 * Function time budget — see the matching note in the RFP extract route.
 * Sections are drafted sequentially, so the worst case here is
 * MAX_SECTIONS_PER_RUN × one Opus call. At ~40s per section that is ~240s for a
 * full batch of 6, which fits 300s with little to spare: raise this before
 * raising the batch cap, and keep the two in step.
 *
 * Unlike extraction there is no claim to unwind — nothing is committed until
 * the closing transaction, so a timeout loses the work but leaves clean state.
 */
export const maxDuration = 300;

const generateSchema = z.object({
  /** Omit to draft every currently-empty section. */
  sectionSlugs: z.array(z.string().min(1)).max(60).optional(),
  /** Overwrite sections that already have content. */
  overwrite: z.boolean().default(false),
});

/** Cap per request so one call can't run past the function's time budget. */
const MAX_SECTIONS_PER_RUN = 6;

/**
 * POST /api/proposals/[id]/generate
 *
 * Drafts sections with Claude and commits the result as ONE new immutable
 * version — not one version per section, which would flood the history.
 *
 * Sections are generated sequentially rather than in parallel: each one is fed
 * the previously-written sections so the model doesn't repeat itself, and the
 * shared cached prefix means a serial run is cheap after the first call.
 */
export const POST = withProposalAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "proposals", "update");
    if (denied) return denied;

    const parsed = generateSchema.safeParse((await req.json().catch(() => null)) ?? {});
    if (!parsed.success) return validationError(parsed.error);

    const proposal = await db.psProposal.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true,
        title: true,
        status: true,
        engagementId: true,
        rfpId: true,
        currentVersion: { select: { sections: true } },
        engagement: {
          select: { title: true, industry: true, techStack: true },
        },
      },
    });
    if (!proposal) return notFound("Proposal");

    if (proposal.status === "won" || proposal.status === "lost") {
      return fail(409, `Cannot generate content for a proposal that is ${proposal.status}`);
    }

    const sections = parseSections(proposal.currentVersion?.sections);
    if (sections.length === 0) {
      return fail(400, "Proposal has no sections to generate");
    }

    // Decide the work list: explicit slugs, else every empty section.
    const requested = parsed.data.sectionSlugs;
    const targets = sections.filter((s) => {
      if (requested) return requested.includes(s.slug);
      return parsed.data.overwrite ? true : !s.html.trim();
    });

    if (targets.length === 0) {
      return fail(400, "No sections matched. Every requested section already has content.");
    }

    const batch = targets.slice(0, MAX_SECTIONS_PER_RUN);
    const deferred = targets.length - batch.length;

    // Grounding: the RFP's requirements plus knowledge assets matching the
    // engagement's industry.
    const requirements = proposal.rfpId
      ? await db.psRfpRequirement.findMany({
          where: { orgId, rfpId: proposal.rfpId },
          select: { text: true, complianceStatus: true, responseText: true },
          orderBy: { sortOrder: "asc" },
          take: 200,
        })
      : [];

    const knowledge = await db.psKnowledgeAsset.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(proposal.engagement.industry ? { industry: proposal.engagement.industry } : {}),
        NOT: { body: null },
      },
      select: { title: true, body: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    const baseContext: Omit<SectionContext, "sectionTitle" | "existingSections"> = {
      engagementTitle: proposal.engagement.title,
      industry: proposal.engagement.industry,
      techStack: proposal.engagement.techStack,
      requirements,
      knowledge: knowledge.map((k) => ({ title: k.title, body: k.body ?? "" })),
    };

    const updated = [...sections];
    let tokensUsed = 0;
    let anyStub = false;

    for (const target of batch) {
      const result = await generateProposalSection({
        ...baseContext,
        sectionTitle: target.title,
        existingSections: updated
          .filter((s) => s.slug !== target.slug && s.html.trim())
          .map((s) => ({ title: s.title, text: sectionToPlainText(s) })),
      });

      const index = updated.findIndex((s) => s.slug === target.slug);
      if (index >= 0) updated[index] = { ...updated[index], html: result.html };

      tokensUsed += result.tokensUsed;
      anyStub = anyStub || result.isStub;
    }

    const normalised = normaliseSections(updated);
    const generatedSlugs = batch.map((s) => s.slug);

    const version = await db.$transaction(async (tx) => {
      const latest = await tx.psProposalVersion.findFirst({
        where: { orgId, proposalId: proposal.id },
        select: { version: true },
        orderBy: { version: "desc" },
      });

      const row = await tx.psProposalVersion.create({
        data: {
          orgId,
          proposalId: proposal.id,
          version: (latest?.version ?? 0) + 1,
          sections: normalised as unknown as Prisma.InputJsonValue,
          changeNote: `AI drafted: ${batch.map((s) => s.title).join(", ")}`,
          source: generatedSlugs.length === sections.length ? "claude" : "claude-section",
          createdBy: userId,
        },
        select: { id: true, version: true },
      });

      await tx.psProposal.update({
        where: { id: proposal.id },
        data: { currentVersionId: row.id, updatedBy: userId },
      });

      await writeTimeline(tx, {
        orgId,
        engagementId: proposal.engagementId,
        type: "proposal-generated",
        actorId: userId,
        summary: `AI drafted ${batch.length} section(s) of "${proposal.title}"`,
        payload: { proposalId: proposal.id, sections: generatedSlugs, isStub: anyStub },
      });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "proposal.generate",
        resource: proposal.id,
        metadata: { sections: generatedSlugs, tokensUsed, isStub: anyStub },
      });

      return row;
    });

    return okSerialized(
      {
        proposalId: proposal.id,
        versionId: version.id,
        version: version.version,
        generated: generatedSlugs,
        deferred,
        isStub: anyStub,
        tokensUsed,
      },
      202,
    );
  },
);
