import { NextResponse } from "next/server";

// DEFERRED: cross-app SSO is handled by the QuikIT IdP in the monorepo —
// callers should redirect to the app's /login (which bounces to the IdP).
// See apps/admin for the reference pattern.

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Cross-app SSO is handled by the QuikIT IdP in the monorepo; use the standard OAuth login flow",
    },
    { status: 501 },
  );
}
