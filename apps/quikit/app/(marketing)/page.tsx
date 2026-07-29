import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { StaticPage } from "./_components/static-page";
import { loadPage } from "./_lib/load-page";
import { buildMetadata } from "./_lib/seo";

/**
 * Behaviour:
 *   - Logged-in user → redirect to `/apps` (the launcher tile grid).
 *   - Logged-out user → render the marketing landing page.
 *
 * `dynamic = "force-dynamic"` because we read the session cookie per
 * request — ISR (the previous `revalidate = 60`) would cache the same
 * HTML for everyone. Static caching still applies to the rest of the
 * marketing tree (`/[slug]`, `/blog/*`) which doesn't need session.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata("index");

export default async function MarketingHome() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/apps");
  }

  const page = await loadPage("index");
  if (!page) notFound();
  return <StaticPage page={page} />;
}
