import { NextResponse } from "next/server";

// DEFERRED: pending schema migration — depends on AppApiKey, UserAppRole,
// AppRolePermission. External callers should fall back to legacy permission
// checks (OrgMember.role / OrgMember.customPermissions) until enabled.
// See apps/new-admin/MIGRATION_NOTES.md.

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "Permission-check endpoint is pending schema migration",
    },
    { status: 501 },
  );
}
