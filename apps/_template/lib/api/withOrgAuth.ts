/**
 * Thin wrapper around the shared tenant-auth factory. Every API route that
 * touches tenant data uses this — it injects { tenantId, userId } from the
 * session and short-circuits with 401 for unauthenticated callers.
 *
 * Use the factory's optional `module` argument when you want a feature-gate
 * check (e.g. only paid tenants on plan X can hit this endpoint).
 */
import { withOrgAuthForModule } from "@quikit/auth/withOrgAuth";

// Pass null/undefined when the route isn't gated by a module.
export const withOrgAuth = withOrgAuthForModule(null);
