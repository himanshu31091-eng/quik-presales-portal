import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, notFound } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { isOwnedByOrg } from "@/lib/storage";

const withEngagementAuth = withOrgAuthForModule("engagements");

/**
 * GET /api/engagements/[id]/documents
 *
 * Documents whose blob key is not under this org's prefix are dropped rather
 * than returned. Belt-and-braces against a row whose blobUrl was tampered with
 * or mis-seeded — the query is already org-scoped, but the URL is the thing
 * the browser will actually fetch.
 */
export const GET = withEngagementAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "engagements", "view");
    if (denied) return denied;

    const engagement = await db.psEngagement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) return notFound("Engagement");

    const documents = await db.psDocument.findMany({
      where: { orgId, engagementId: engagement.id },
      select: {
        id: true,
        category: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        blobUrl: true,
        version: true,
        status: true,
        rejectReason: true,
        uploadedById: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return okSerialized(documents.filter((d) => isOwnedByOrg(d.blobUrl, orgId)));
  },
);
