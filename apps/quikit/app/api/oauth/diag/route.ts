import { NextResponse } from "next/server";
import { jwtVerify, createLocalJWKSet } from "jose";
import { generateIdToken, getJWKS } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Return a safe preview of an env var value so we can debug its shape
 *  without leaking key material. Shows length, first-few/last-few chars,
 *  and which newline styles are present. */
function describeEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return { name, present: false };
  const length = raw.length;
  const first20 = raw.slice(0, 20);
  const last20 = raw.slice(-20);
  return {
    name,
    present: true,
    length,
    first20,
    last20,
    hasLiteralBackslashN: raw.includes("\\n"),
    hasRealNewline: raw.includes("\n"),
    hasBeginMarker: raw.includes("-----BEGIN"),
    hasEndMarker: raw.includes("-----END"),
    startsWithDashes: raw.startsWith("-"),
  };
}

/**
 * GET /api/oauth/diag — TEMPORARY diagnostic endpoint
 *
 * Signs a token with our private key, then verifies it against our own
 * JWKS (the same JWK that is published to clients). If signing and
 * verifying both succeed, the private/public key pair is consistent.
 * If signing succeeds but verification fails, JWT_SIGNING_KEY and
 * JWT_SIGNING_KEY_PUBLIC are mismatched — that is the OAuth callback bug.
 *
 * Remove after the signing-key issue is diagnosed.
 */
export async function GET() {
  // Always report env-var shape first, even if key parsing later fails.
  const envReport = {
    JWT_SIGNING_KEY: describeEnv("JWT_SIGNING_KEY"),
    JWT_SIGNING_KEY_PUBLIC: describeEnv("JWT_SIGNING_KEY_PUBLIC"),
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
  };

  try {
    // 1. Generate an id_token the same way /api/oauth/token does
    const idToken = await generateIdToken(
      {
        sub: "diag-user",
        email: "diag@quikit.test",
        name: "Diag User",
        tenant_id: "diag-tenant",
        role: "member",
      },
      "diag-client",
    );

    // 2. Fetch our own JWKS
    const jwks = await getJWKS();

    // 3. Try to verify the token against the JWKS
    const localJwks = createLocalJWKSet(jwks as unknown as Parameters<typeof createLocalJWKSet>[0]);
    let verifyResult: { ok: boolean; payload?: unknown; error?: string } = { ok: false };
    try {
      const { payload } = await jwtVerify(idToken, localJwks, {
        issuer: process.env.NEXTAUTH_URL,
        audience: "diag-client",
      });
      verifyResult = { ok: true, payload };
    } catch (err: unknown) {
      verifyResult = {
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }

    // Expose a decoded header + JWKS summary for manual inspection
    const [headerB64, payloadB64] = idToken.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf-8"));
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));

    return NextResponse.json(
      {
        env: envReport,
        idTokenHeader: header,
        idTokenPayload: payload,
        idTokenLength: idToken.length,
        jwks: {
          keyCount: jwks.keys.length,
          firstKid: jwks.keys[0]?.kid,
          firstAlg: jwks.keys[0]?.alg,
          firstKty: jwks.keys[0]?.kty,
          firstNPrefix: typeof jwks.keys[0]?.n === "string" ? jwks.keys[0].n.slice(0, 40) : null,
        },
        verify: verifyResult,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        env: envReport,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 10) : null,
      },
      { status: 500 },
    );
  }
}
