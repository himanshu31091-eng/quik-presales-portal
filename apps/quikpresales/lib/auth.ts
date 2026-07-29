import { createOAuthClientOptions, createAuthOptions } from "@quikit/auth";
import "@quikit/auth/types";

/**
 * QuikPreSales auth configuration.
 *
 * When QUIKIT_URL (or the OIDC-style alias QUIKIT_ISSUER_URL) is set, the app
 * authenticates via QuikIT's OAuth2 flow — the platform IdP model every app
 * uses. When unset, falls back to a direct CredentialsProvider for local-only
 * dev.
 *
 * Both env names are accepted because some operators provision the IdP URL
 * under the OIDC-conventional name `QUIKIT_ISSUER_URL`. Reading only
 * QUIKIT_URL silently drops the app into credentials mode (no "quikit"
 * provider), which makes signIn("quikit") on /login loop forever. Mirrors
 * quikscale / quiktrack / quikvc.
 */
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
const QUIKIT_CLIENT_ID = process.env.QUIKIT_CLIENT_ID;
const QUIKIT_CLIENT_SECRET = process.env.QUIKIT_CLIENT_SECRET;

export const authOptions =
  QUIKIT_URL && QUIKIT_CLIENT_ID && QUIKIT_CLIENT_SECRET
    ? createOAuthClientOptions({
        quikitUrl: QUIKIT_URL,
        clientId: QUIKIT_CLIENT_ID,
        clientSecret: QUIKIT_CLIENT_SECRET,
      })
    : createAuthOptions({
        signInPage: "/login",
        errorPage: "/login",
      });
