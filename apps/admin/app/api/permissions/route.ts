import { NextResponse } from "next/server";

// DEFERRED: pending schema migration — depends on AppPermission.
// See apps/new-admin/MIGRATION_NOTES.md.

export async function GET() {
  return NextResponse.json(
    { success: false, error: "Permissions catalogue is pending schema migration" },
    { status: 501 },
  );
}
