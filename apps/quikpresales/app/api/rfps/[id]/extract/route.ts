import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound, fail } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { extractDocument } from "@/lib/documents/extract-text";
import {
  extractRequirementsFromPdf,
  extractRequirementsFromText,
} from "@/lib/ai/prompts/extract-requirements";

const withRfpAuth = withOrgAuthForModule("rfp");

/**
 * POST /api/rfps/[id]/extract
 *
 * Runs requirement extraction. Long-running (a large RFP at high effort takes
 * minutes), so this returns 202 immediately and the UI polls
 * GET /api/rfps/[id] for `status`.
 *
 * The job runs inside this invocation rather than on a queue — Vercel
 * serverless is the platform default here and BullMQ is dead in this repo.
 * `status` on the row is the job record: extracting → extracted, or back to
 * uploaded with `extractError` set.
 *
 * Guarded against double-submit: a request while `status === "extracting"`
 * returns 409 rather than starting a second pass that would duplicate rows.
 */
export const POST = withRfpAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const denied = await requirePermission(userId, orgId, "rfp", "update");
  if (denied) return denied;

  const rfp = await db.psRfp.findFirst({
    where: { id: params.id, orgId },
    select: {
      id: true,
      title: true,
      status: true,
      sourceDocId: true,
      engagementId: true,
      engagement: { select: { title: true } },
    },
  });
  if (!rfp) return notFound("RFP");

  if (rfp.status === "extracting") {
    return fail(409, "Extraction is already running for this RFP");
  }
  if (!rfp.sourceDocId) {
    return fail(400, "This RFP has no source document to extract from");
  }

  const doc = await db.psDocument.findFirst({
    where: { id: rfp.sourceDocId, orgId },
    select: { blobUrl: true, mimeType: true, filename: true },
  });
  if (!doc) return notFound("Source document");

  // Claim the job before doing any slow work, so a concurrent request 409s.
  await db.psRfp.update({
    where: { id: rfp.id },
    data: { status: "extracting", extractError: null, updatedBy: userId },
  });

  try {
    const extracted = await extractDocument(doc.blobUrl, doc.mimeType);

    const result =
      extracted.kind === "pdf"
        ? await extractRequirementsFromPdf(extracted.pdfBase64 ?? "", rfp.engagement.title)
        : await extractRequirementsFromText(extracted.text ?? "", rfp.engagement.title);

    await db.$transaction(async (tx) => {
      // Replace rather than append: re-running extraction on the same document
      // should converge on one matrix, not stack duplicates. Only AI-generated
      // rows are cleared — anything a human wrote a response against survives.
      await tx.psRfpRequirement.deleteMany({
        where: { orgId, rfpId: rfp.id, aiGenerated: true, responseText: null },
      });

      if (result.requirements.length > 0) {
        await tx.psRfpRequirement.createMany({
          data: result.requirements.map((r, index) => ({
            orgId,
            rfpId: rfp.id,
            text: r.text,
            category: r.category,
            citation: r.citation ?? undefined,
            complianceStatus: r.complianceStatus,
            aiGenerated: true,
            sortOrder: index,
          })),
        });
      }

      await tx.psRfp.update({
        where: { id: rfp.id },
        data: {
          status: "extracted",
          extractedText: extracted.kind === "text" ? extracted.text : null,
          updatedBy: userId,
        },
      });

      await writeTimeline(tx, {
        orgId,
        engagementId: rfp.engagementId,
        type: "rfp-extracted",
        actorId: userId,
        summary: `Extracted ${result.requirements.length} requirements from "${rfp.title}"`,
        payload: { rfpId: rfp.id, count: result.requirements.length, isStub: result.isStub },
      });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "rfp.extract",
        resource: rfp.id,
        metadata: { count: result.requirements.length, tokensUsed: result.tokensUsed },
      });
    });

    return okSerialized(
      {
        id: rfp.id,
        status: "extracted",
        requirementCount: result.requirements.length,
        isStub: result.isStub,
      },
      202,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Extraction failed";

    // Record the failure on the row so the UI can show it and the user can
    // retry, rather than leaving the RFP wedged in "extracting" forever.
    await db.psRfp.update({
      where: { id: rfp.id },
      data: { status: "uploaded", extractError: message, updatedBy: userId },
    });
    await writeAudit(db, {
      orgId,
      userId,
      action: "rfp.extract",
      resource: rfp.id,
      outcome: "error",
      metadata: { message },
    });

    return fail(502, `Extraction failed: ${message}`);
  }
});
