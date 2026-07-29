import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";


/**
 * GET /.well-known/openid-configuration
 *
 * OIDC Discovery endpoint. Returns the metadata document that OAuth clients
 * (QuikScale, Admin Portal) use to locate the authorization, token, userinfo,
 * and JWKS endpoints, plus the supported algorithms and scopes.
 *
 * NextAuth's OIDC provider uses this to discover the `jwks_uri` so it can
 * verify id_token signatures. Without this endpoint, NextAuth's callback
 * fails silently with OAUTH_CALLBACK_ERROR before calling userinfo.
 */

export async function GET(request: NextRequest) {
  // Prefer NEXTAUTH_URL as the canonical issuer; fall back to request origin
  // for local dev. The `iss` claim in id_tokens uses the same value
  // (see apps/quikit/lib/oauth.ts — ISSUER).
  const issuer = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;

  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/api/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
      jwks_uri: `${issuer}/api/oauth/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email", "tenant"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
      ],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      claims_supported: [
        "sub",
        "email",
        "email_verified",
        "name",
        "given_name",
        "family_name",
        "picture",
        "tenant_id",
        "role",
      ],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
