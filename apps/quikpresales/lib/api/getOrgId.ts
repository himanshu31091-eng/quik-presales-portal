import { createGetOrgId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

/**
 * Resolves the caller's active orgId from their session. Thin wrapper around
 * the shared factory so the app slug lives in exactly one place.
 */
export const getOrgId = createGetOrgId(authOptions, { appSlug: "quikpresales" });
