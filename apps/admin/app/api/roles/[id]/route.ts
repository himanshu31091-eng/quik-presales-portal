import { NextResponse } from "next/server";

// DEFERRED: pending schema migration — depends on AppRole, AppRolePermission.
// See apps/new-admin/MIGRATION_NOTES.md.

function stub() {
  return NextResponse.json(
    { success: false, error: "Roles management is pending schema migration" },
    { status: 501 },
  );
}

export const GET = stub;
export const PATCH = stub;
export const DELETE = stub;
