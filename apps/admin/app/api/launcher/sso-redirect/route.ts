import { NextResponse } from "next/server";

// DEFERRED: this endpoint issued a signed JWT for cross-app SSO in the
// standalone build. In the monorepo, cross-app SSO is handled by the
// central QuikIT OAuth IdP — apps redirect through @quikit/auth's
// createOAuthClientOptions flow instead. This stub returns 501 so callers
// fail loudly rather than redirecting to a broken target.

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
