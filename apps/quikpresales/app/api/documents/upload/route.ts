import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { createdSerialized, fail, notFound } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import {
  ALLOWED_MIME,
  DOCUMENT_CATEGORIES,
  MAX_UPLOAD_BYTES,
  sanitizeFilename,
  uploadDocument,
  type DocumentCategory,
} from "@/lib/storage";

const withEngagementAuth = withOrgAuthForModule("engagements");

/**
 * POST /api/documents/upload  (multipart/form-data)
 *
 * Fields: file, engagementId, category
 *
 * Writes the bytes to Vercel Blob under an org-prefixed key, then records the
 * PsDocument row + a timeline entry in one transaction. The blob write happens
 * first because it is the only non-transactional step — if the DB write then
 * fails we leak an orphan blob, which is recoverable; the reverse (a row
 * pointing at bytes that were never stored) is not.
 */
export const POST = withEngagementAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "engagements", "update");
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Expected multipart/form-data");

  const file = form.get("file");
  const engagementId = String(form.get("engagementId") ?? "");
  const category = String(form.get("category") ?? "other");

  if (!(file instanceof File)) return fail(400, "file is required");
  if (!engagementId) return fail(400, "engagementId is required");
  if (!DOCUMENT_CATEGORIES.includes(category as DocumentCategory)) {
    return fail(400, `category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}`);
  }
  if (file.size === 0) return fail(400, "File is empty");
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(413, `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / 1_000_000)} MB upload limit`);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return fail(415, `Unsupported file type "${file.type || "unknown"}"`);
  }

  const engagement = await db.psEngagement.findFirst({
    where: { id: engagementId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!engagement) return notFound("Engagement");

  const { url } = await uploadDocument(orgId, engagement.id, file);
  const filename = sanitizeFilename(file.name);

  const document = await db.$transaction(async (tx) => {
    const row = await tx.psDocument.create({
      data: {
        orgId,
        engagementId: engagement.id,
        category,
        filename,
        mimeType: file.type,
        sizeBytes: file.size,
        blobUrl: url,
        uploadedById: userId,
      },
    });

    await writeTimeline(tx, {
      orgId,
      engagementId: engagement.id,
      type: "document-uploaded",
      actorId: userId,
      summary: `Uploaded ${category} document "${filename}"`,
      payload: { documentId: row.id, category, sizeBytes: file.size },
    });
    await writeAudit(tx, {
      orgId,
      userId,
      action: "document.upload",
      resource: row.id,
      metadata: { engagementId: engagement.id, category, filename },
    });

    return row;
  });

  return createdSerialized(document);
});
