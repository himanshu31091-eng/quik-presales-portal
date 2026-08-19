import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { createdSerialized, fail } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, uploadKnowledgeAsset } from "@/lib/storage";

const withKnowledgeAuth = withOrgAuthForModule("library.knowledge");

/**
 * POST /api/knowledge/upload  (multipart/form-data)
 *
 * Fields: file
 *
 * Uploads bytes to Vercel Blob under this org's knowledge scope and returns
 * the resulting URL. Does not touch PsKnowledgeAsset — the caller includes
 * the returned blobUrl in a subsequent POST/PATCH /api/knowledge[/id] call,
 * so this endpoint works the same way for both the create and edit forms
 * (the asset doesn't exist yet on create, so there's nothing to attach to
 * here).
 */
export const POST = withKnowledgeAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "knowledge", "create");
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Expected multipart/form-data");

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "file is required");
  if (file.size === 0) return fail(400, "File is empty");
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(413, `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / 1_000_000)} MB upload limit`);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return fail(415, `Unsupported file type "${file.type || "unknown"}"`);
  }

  const { url } = await uploadKnowledgeAsset(orgId, file);

  await writeAudit(db, {
    orgId,
    userId,
    action: "knowledge.upload",
    resource: url,
    metadata: { filename: file.name, sizeBytes: file.size },
  });

  return createdSerialized({ blobUrl: url });
});
