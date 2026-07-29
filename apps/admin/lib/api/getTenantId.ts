import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Back-compat alias kept while routes still import `getTenantId`.
 * Returns the orgId on the JWT session — the monorepo uses `orgId`
 * everywhere; "tenant" is the legacy name from when this app was
 * standalone.
 */
export async function getTenantId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.orgId ?? null;
}

/** Preferred name — use this in new code. */
export async function getOrgId(): Promise<string | null> {
  return getTenantId();
}
