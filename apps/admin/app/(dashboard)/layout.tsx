import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Sidebar from "@/components/dashboard/sidebar";
import Header from "@/components/dashboard/header";
import { SessionGuard } from "@/components/session-guard";
import { FeatureDisabledToast } from "@quikit/ui";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");
  if (!session.user.orgId) {
    // Org selection lives on the central launcher /apps, not a local page.
    // (Middleware normally catches this first; this is defense-in-depth.)
    const launcher = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
    redirect(launcher ? `${launcher}/apps` : "/login");
  }

  return (
    <SessionGuard>
      <div className="flex h-screen overflow-hidden bg-[var(--color-bg-secondary)]">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
        <FeatureDisabledToast />
      </div>
    </SessionGuard>
  );
}
