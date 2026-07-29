import { db } from "@/lib/db";

interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  orgId?: string;
  oldValues?: string;
  newValues?: string;
}

/**
 * Fire-and-forget audit log entry.
 * Never throws — audit logging should never break the main operation.
 */
export function logAudit(entry: AuditEntry): void {
  db.auditLog
    .create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorId: entry.actorId,
        orgId: entry.orgId || "platform",
        oldValues: entry.oldValues ?? null,
        newValues: entry.newValues ?? null,
      },
    })
    .catch(() => {
      console.error("[audit] Failed to log:", entry.action, entry.entityType, entry.entityId);
    });
}
