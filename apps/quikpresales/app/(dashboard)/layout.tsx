import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { authOptions } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// Session is read and access is gated per request — never prerender.
export const dynamic = "force-dynamic";

const APP_SLUG = "quikpresales";

/**
 * Server layout for the dashboard route group.
 *
 * The app-access check runs HERE, server-side, before any protected UI is
 * rendered. A user whose org isn't granted QuikPreSales is redirected to the
 * landing page (`/?reason=no_app_access`) where AppAccessDeniedPopup explains
 * it — the dashboard never paints, so there is no flash of chrome they aren't
 * entitled to. Middleware only proves *authentication*; this proves
 * *entitlement*, and they are different questions.
 *
 * The client SessionGuard inside <DashboardShell> is the live-revocation
 * backstop for access lost while the user is already inside.
 *
 * Mirrors apps/quikscale/app/(dashboard)/layout.tsx.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  await requireAppAccess({
    userId: session?.user?.id,
    orgId: session?.user?.orgId,
    appSlug: APP_SLUG,
    isSuperAdmin: session?.user?.isSuperAdmin === true,
    memberRole: session?.user?.membershipRole,
    homeUrl: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

  return <DashboardShell>{children}</DashboardShell>;
}
