import { z } from "zod";
import { NextResponse } from "next/server";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { parseSections } from "@/lib/proposals/sections";

const withProposalAuth = withOrgAuthForModule("proposals");

const exportSchema = z.object({
  format: z.enum(["pdf", "docx"]),
  /** Export a historical version instead of the current one. */
  version: z.number().int().min(1).optional(),
});

/** Filename-safe slug; never let a proposal title shape the header. */
function safeFilename(title: string, ext: string): string {
  const base = title.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-").slice(0, 80) || "proposal";
  return `${base}.${ext}`;
}

/**
 * POST /api/proposals/[id]/export — stream a PDF or Word document.
 *
 * `view` rather than `update`: exporting is a read. Anyone who can see the
 * proposal can take a copy of it.
 */
export const POST = withProposalAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "proposals", "view");
    if (denied) return denied;

    const parsed = exportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    const { format, version } = parsed.data;

    const proposal = await db.psProposal.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true,
        title: true,
        currentVersionId: true,
        engagement: { select: { title: true } },
      },
    });
    if (!proposal) return notFound("Proposal");

    const versionRow = version
      ? await db.psProposalVersion.findFirst({
          where: { orgId, proposalId: proposal.id, version },
          select: { sections: true, version: true },
        })
      : proposal.currentVersionId
        ? await db.psProposalVersion.findFirst({
            where: { orgId, id: proposal.currentVersionId },
            select: { sections: true, version: true },
          })
        : null;

    if (!versionRow) return notFound(version ? "Version" : "Proposal content");

    const sections = parseSections(versionRow.sections);
    if (sections.length === 0) return fail(400, "Proposal has no content to export");

    const input = {
      title: proposal.title,
      engagementTitle: proposal.engagement.title,
      sections,
    };

    let body: Buffer;
    let contentType: string;
    let filename: string;

    if (format === "pdf") {
      const { buildProposalPdf } = await import("@/lib/export/pdf");
      body = await buildProposalPdf(input);
      contentType = "application/pdf";
      filename = safeFilename(proposal.title, "pdf");
    } else {
      const { buildProposalDocx } = await import("@/lib/export/docx");
      body = await buildProposalDocx(input);
      contentType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      filename = safeFilename(proposal.title, "docx");
    }

    await writeAudit(db, {
      orgId,
      userId,
      action: "proposal.export",
      resource: proposal.id,
      metadata: { format, version: versionRow.version },
    });

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  },
);
