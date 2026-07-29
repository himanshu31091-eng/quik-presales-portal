import { NextResponse } from "next/server";

// DEFERRED: pending schema migration — depends on TenantApp + per-app
// module flag definitions. The shared schema has OrgAppAccess + AppModuleFlag
// which can replace this; see apps/new-admin/MIGRATION_NOTES.md.

export async function GET() {
  return NextResponse.json(
    { success: false, error: "App modules listing is pending schema migration" },
    { status: 501 },
  );
}
