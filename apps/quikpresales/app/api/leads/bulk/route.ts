import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, fail } from "@/lib/api/responses";
import { writeAudit, writeTimeline } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { STAGE_PROBABILITY } from "@/lib/pipeline";
import { csvToRecords } from "@/lib/csv";
import { toMinorUnits } from "@/lib/currency/currencies";

const withLeadAuth = withOrgAuthForModule("engagements");

const MAX_ROWS = 500;

const rowSchema = z.object({
  title: z.string().trim().min(3, "title must be at least 3 characters"),
  requirement: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  territory: z.string().trim().optional(),
  budgetHint: z.string().trim().optional(),
  timelineHint: z.string().trim().optional(),
  techStack: z.string().trim().optional(),
  crmOpportunityId: z.string().trim().optional(),
  estRevenue: z.string().trim().optional(),
  currency: z.string().trim().optional(),
});

interface RowError {
  row: number;
  title: string;
  message: string;
}

/**
 * POST /api/leads/bulk  (multipart/form-data, field: file — a CSV)
 *
 * The one-at-a-time /api/leads intake runs every submission through an AI
 * requirement-evaluation call. That's the right cost for a rep typing up one
 * deal, but wrong for a spreadsheet of fifty rows: instead of prompting
 * fifty AI calls, bulk-imported leads skip evaluation entirely and land
 * directly in the queue as "ready for review" (no gaps recorded means
 * GET /api/leads reads blockerCount 0, matching how a lead with no flagged
 * gaps already displays). Re-running the AI screening on any one of them
 * later is not supported by this endpoint — that's what the existing
 * per-lead flow is for.
 *
 * Every row is independent: one bad row is skipped and reported, not a
 * reason to fail the whole file.
 */
export const POST = withLeadAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "engagements", "create");
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Expected multipart/form-data");

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "file is required");
  if (file.size === 0) return fail(400, "File is empty");
  if (file.size > 2_000_000) return fail(413, "CSV exceeds the 2 MB limit");

  const text = await file.text();
  const records = csvToRecords(text);
  if (records.length === 0) return fail(400, "No data rows found in the CSV");
  if (records.length > MAX_ROWS) return fail(413, `CSV has more than ${MAX_ROWS} rows`);

  const errors: RowError[] = [];
  let created = 0;

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2; // header is row 1
    const parsed = rowSchema.safeParse(records[i]);
    if (!parsed.success) {
      errors.push({
        row: rowNum,
        title: records[i].title ?? "",
        message: parsed.error.issues.map((iss) => iss.message).join("; "),
      });
      continue;
    }
    const input = parsed.data;

    let estRevenueMinor: bigint | undefined;
    if (input.estRevenue) {
      const n = Number(input.estRevenue);
      if (Number.isFinite(n) && n >= 0) {
        estRevenueMinor = toMinorUnits(n, input.currency || "INR");
      } else {
        errors.push({ row: rowNum, title: input.title, message: `Invalid estRevenue "${input.estRevenue}"` });
        continue;
      }
    }

    try {
      await db.$transaction(async (tx) => {
        const engagement = await tx.psEngagement.create({
          data: {
            orgId,
            title: input.title,
            industry: input.industry || undefined,
            territory: input.territory || undefined,
            stage: "lead",
            closedStatus: "open",
            probability: STAGE_PROBABILITY.lead,
            techStack: input.techStack
              ? input.techStack.split(";").map((t) => t.trim()).filter(Boolean)
              : [],
            salesOwnerId: userId,
            ...(input.crmOpportunityId ? { crmOpportunityId: input.crmOpportunityId } : {}),
            ...(estRevenueMinor !== undefined ? { estRevenue: estRevenueMinor } : {}),
            ...(input.currency ? { currency: input.currency } : {}),
            createdBy: userId,
            updatedBy: userId,
          },
          select: { id: true, title: true },
        });

        const briefText =
          input.requirement && input.requirement.length > 0
            ? input.requirement
            : `${[input.budgetHint, input.timelineHint].filter(Boolean).join(" · ") || "Bulk-imported lead — no detailed requirement provided at submission."}`;

        const rfp = await tx.psRfp.create({
          data: {
            orgId,
            engagementId: engagement.id,
            title: `Requirement — ${input.title}`,
            status: "extracted",
            extractedText: briefText,
            createdBy: userId,
            updatedBy: userId,
          },
          select: { id: true },
        });

        await writeTimeline(tx, {
          orgId,
          engagementId: engagement.id,
          type: "lead-submitted",
          actorId: userId,
          summary: "Lead bulk-imported — no AI screening run",
          payload: { rfpId: rfp.id, bulkImport: true },
        });
      });
      created += 1;
    } catch (e: unknown) {
      errors.push({
        row: rowNum,
        title: input.title,
        message: e instanceof Error ? e.message : "Failed to create",
      });
    }
  }

  await writeAudit(db, {
    orgId,
    userId,
    action: "leads.bulk-import",
    metadata: { totalRows: records.length, created, errorCount: errors.length },
  });

  return okSerialized({ totalRows: records.length, created, errors });
});
