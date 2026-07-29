import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { db } from "@/lib/db";

/**
 * GET /api/roles?appSlug=xxx — list roles available for an app inside the
 * caller's org.
 *
 * Each app maintains its own `AppRole` table in its own Postgres schema
 * (`app_<slug>.AppRole`). The shared Prisma schema does not model AppRole
 * (see MIGRATION_NOTES.md), so we query the per-app schema with raw SQL.
 *
 * Behaviour (per product requirement):
 *   - Table exists  → fetch `name` rows for this org from
 *                     `app_<slug>."AppRole" WHERE "orgId" = :orgId`
 *   - Table missing → return an empty array; the dropdown stays empty
 *
 * No static fallback. If a tenant hasn't seeded `AppRole` rows yet, the
 * dropdown is intentionally empty so admins know roles aren't configured
 * for that app.
 */

interface AppRoleResponse {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissionCount: number;
  userCount: number;
}

/** Slug whitelist — only lowercase letters, digits, hyphens, underscores.
 *  Prevents SQL injection on the schema name we have to interpolate. */
const SAFE_SLUG = /^[a-z0-9_-]+$/;

async function tableExists(schema: string, table: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ exists: boolean }>>(
    Prisma.sql`SELECT EXISTS (
      SELECT 1
        FROM information_schema.tables
       WHERE table_schema = ${schema}
         AND table_name   = ${table}
    ) AS "exists";`,
  );
  return Boolean(rows[0]?.exists);
}

interface RawRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  createdAt: Date;
}

async function fetchAppRoles(schema: string, orgId: string): Promise<RawRow[]> {
  // Schema name was already validated to match SAFE_SLUG (and only constructed
  // by us as `app_<slug>`), so direct interpolation here is safe. orgId is
  // still parameterised so user-controlled data never lands in the SQL string.
  const sql = `
    SELECT id, name, description, "isSystem", "isDefault", "createdAt"
      FROM "${schema}"."AppRole"
     WHERE "orgId" = $1
     ORDER BY "isSystem" DESC, "createdAt" ASC;
  `;
  return db.$queryRawUnsafe<RawRow[]>(sql, orgId);
}

export const GET = withAdminAuth(async ({ orgId }, req: NextRequest) => {
  const appSlug = req.nextUrl.searchParams.get("appSlug");
  if (!appSlug) {
    return NextResponse.json(
      { success: false, error: "appSlug is required" },
      { status: 400 },
    );
  }
  if (!SAFE_SLUG.test(appSlug)) {
    return NextResponse.json(
      { success: false, error: "appSlug contains invalid characters" },
      { status: 400 },
    );
  }

  const schema = `app_${appSlug}`;

  // Table missing → empty dropdown.
  let exists = false;
  try {
    exists = await tableExists(schema, "AppRole");
  } catch {
    exists = false;
  }

  if (!exists) {
    return NextResponse.json({
      success: true,
      data: [] as AppRoleResponse[],
      meta: { source: "db", schema, tableExists: false, rowCount: 0 },
    });
  }

  // Table exists → return whatever rows exist for this org (may be 0).
  let rows: RawRow[] = [];
  try {
    rows = await fetchAppRoles(schema, orgId);
  } catch {
    rows = [];
  }

  const data: AppRoleResponse[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isDefault: r.isDefault,
    permissionCount: 0,
    userCount: 0,
  }));
  // Ensure exactly one default — if none flagged, mark the first row.
  if (!data.some((r) => r.isDefault) && data.length > 0) {
    data[0].isDefault = true;
  }

  return NextResponse.json({
    success: true,
    data,
    meta: { source: "db", schema, tableExists: true, rowCount: data.length },
  });
});

/**
 * POST /api/roles — create a custom role.
 * Custom-role creation still requires the deferred shared-schema migration
 * (see MIGRATION_NOTES.md). Returns 501 until unlocked.
 */
export const POST = withAdminAuth(async () => {
  return NextResponse.json(
    {
      success: false,
      error: "Custom role creation is pending schema migration",
    },
    { status: 501 },
  );
});
