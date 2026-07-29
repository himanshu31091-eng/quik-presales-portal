import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Audit + timeline writers.
 *
 * Both take the transaction client so the audit row commits or rolls back with
 * the mutation it describes — an audit trail that can disagree with the data is
 * worse than none.
 */

type Tx = Prisma.TransactionClient | PrismaClient;

export interface AuditInput {
  orgId: string;
  userId?: string | null;
  /** Dot-namespaced, e.g. "engagement.create", "proposal.transition". */
  action: string;
  /** Id of the row acted on. */
  resource?: string | null;
  outcome?: "ok" | "deny" | "error";
  metadata?: Prisma.InputJsonValue;
}

export async function writeAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.psAuditLog.create({
    data: {
      orgId: input.orgId,
      userId: input.userId ?? null,
      action: input.action,
      resource: input.resource ?? null,
      outcome: input.outcome ?? "ok",
      metadata: input.metadata,
    },
  });
}

export interface TimelineInput {
  orgId: string;
  engagementId: string;
  type: string;
  actorId?: string | null;
  summary: string;
  payload?: Prisma.InputJsonValue;
  visibility?: "internal" | "customer";
}

export async function writeTimeline(tx: Tx, input: TimelineInput): Promise<void> {
  await tx.psTimelineEvent.create({
    data: {
      orgId: input.orgId,
      engagementId: input.engagementId,
      type: input.type,
      actorId: input.actorId ?? null,
      summary: input.summary,
      payload: input.payload,
      visibility: input.visibility ?? "internal",
    },
  });
}
