import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, notFound, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";

const withRfpAuth = withOrgAuthForModule("rfp");

const listQuery = z.object({
  complianceStatus: z.enum(["compliant", "partial", "gap", "clarify"]).optional(),
  unanswered: z.enum(["true", "false"]).optional(),
});

const createSchema = z.object({
  text: z.string().min(1, "Requirement text is required").max(8000),
  category: z.string().max(60).optional(),
  complianceStatus: z.enum(["compliant", "partial", "gap", "clarify"]).default("clarify"),
  responseText: z.string().max(20000).optional(),
});

async function rfpInOrg(id: string, orgId: string) {
  return db.psRfp.findFirst({ where: { id, orgId }, select: { id: true } });
}

/** GET /api/rfps/[id]/requirements — the compliance matrix. */
export const GET = withRfpAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const denied = await requirePermission(userId, orgId, "rfp", "view");
  if (denied) return denied;

  const rfp = await rfpInOrg(params.id, orgId);
  if (!rfp) return notFound("RFP");

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const where: Prisma.PsRfpRequirementWhereInput = {
    orgId,
    rfpId: rfp.id,
    ...(parsed.data.complianceStatus && { complianceStatus: parsed.data.complianceStatus }),
    ...(parsed.data.unanswered === "true" && { responseText: null }),
  };

  // Returned unpaginated: the matrix is reviewed as a whole and the
  // requirement count per RFP is bounded by the source document.
  const requirements = await db.psRfpRequirement.findMany({
    where,
    select: {
      id: true,
      text: true,
      category: true,
      citation: true,
      complianceStatus: true,
      responseText: true,
      aiGenerated: true,
      sortOrder: true,
      updatedAt: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const summary = requirements.reduce<Record<string, number>>((acc, r) => {
    acc[r.complianceStatus] = (acc[r.complianceStatus] ?? 0) + 1;
    return acc;
  }, {});

  return okSerialized({ requirements, summary, total: requirements.length });
});

/** POST /api/rfps/[id]/requirements — add a requirement the extractor missed. */
export const POST = withRfpAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const denied = await requirePermission(userId, orgId, "rfp", "update");
  if (denied) return denied;

  const rfp = await rfpInOrg(params.id, orgId);
  if (!rfp) return notFound("RFP");

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const last = await db.psRfpRequirement.findFirst({
    where: { orgId, rfpId: rfp.id },
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });

  const requirement = await db.$transaction(async (tx) => {
    const row = await tx.psRfpRequirement.create({
      data: {
        orgId,
        rfpId: rfp.id,
        text: parsed.data.text,
        category: parsed.data.category,
        complianceStatus: parsed.data.complianceStatus,
        responseText: parsed.data.responseText,
        aiGenerated: false,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await writeAudit(tx, {
      orgId,
      userId,
      action: "rfp.requirement.create",
      resource: row.id,
      metadata: { rfpId: rfp.id },
    });
    return row;
  });

  return createdSerialized(requirement);
});
