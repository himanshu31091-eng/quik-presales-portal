/**
 * RLS (Row-Level Security) integration for Prisma.
 *
 * Call `setTenantContext(tenantId)` at the start of each API request
 * to set the Postgres session variable `app.tenant_id`. RLS policies
 * (defined in rls-policies.sql) then enforce that every SELECT/INSERT/
 * UPDATE/DELETE only touches rows matching that tenantId.
 *
 * This is belt-and-braces on top of the application-level `WHERE tenantId`
 * filters. Both layers must agree — if either is wrong, the other catches it.
 *
 * Usage in withOrgAuth:
 *   import { setTenantContext } from "@quikit/database/rls";
 *   await setTenantContext(tenantId);
 *   // ... run queries ...
 *
 * IMPORTANT: This uses `SET LOCAL` which is transaction-scoped. For
 * non-transactional queries, use `SET` (session-scoped) instead.
 * In serverless (Vercel Functions), each request gets its own connection,
 * so session-scoped is effectively request-scoped.
 */

import { db } from "./index";

/**
 * Set the tenant context for the current database session/transaction.
 *
 * Must be called BEFORE any tenant-scoped queries in the request.
 * The RLS policies in rls-policies.sql will then automatically filter
 * all queries to only include rows matching this tenantId.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setTenantContext(tenantId: string): Promise<void> {
  if (!tenantId) return;
  // Defence-in-depth: reject anything that isn't a strict UUID before
  // interpolating into the SQL string.
  if (!UUID_RE.test(tenantId)) return;
  try {
    // Use $executeRawUnsafe because $executeRaw doesn't support SET commands
    // with parameterized values. The tenantId is already validated by
    // withOrgAuth before this point AND the UUID regex above.
    await db.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
  } catch {
    // Swallow — RLS is an additional safety layer, not a blocker.
    // If SET fails (e.g., Postgres version doesn't support custom GUCs),
    // the app-level tenantId filter still protects the data.
  }
}

/**
 * Clear the tenant context (for cleanup or testing).
 */
export async function clearTenantContext(): Promise<void> {
  try {
    await db.$executeRawUnsafe("RESET app.tenant_id");
  } catch {
    // Swallow
  }
}
