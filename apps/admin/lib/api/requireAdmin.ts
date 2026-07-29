import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";

/**
 * Mirrors apps/admin/lib/api/requireAdmin.ts — thin factory wrapper.
 *
 * Returns `{ session, userId, orgId, membership }` on success or
 * `{ error: NextResponse }` on failure. Used by withAdminAuth below.
 */
export const requireAdmin = createRequireAdmin(authOptions);
