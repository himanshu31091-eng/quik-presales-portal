"use client";

import { useSession, signOut } from "next-auth/react";
import { ArrowLeftRight } from "lucide-react";
import { AppSwitcher, UserMenu, globalSignOut } from "@quikit/ui";

/**
 * Header — mirrors apps/admin/components/dashboard/header.tsx.
 * Uses the real @quikit/ui AppSwitcher + UserMenu with globalSignOut so the
 * QuikIT IdP session is terminated alongside the local session.
 */
export default function Header() {
  const { data: session, update: updateSession } = useSession();

  const fullName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const email = session?.user?.email || "";
  const isImpersonating = session?.user?.impersonating === true;

  async function handleSignOut() {
    // Single-logout: clear admin cookie, auth-host cookie, AND launcher
    // cookie. Without authUrl, the auth-host cookie would persist and
    // silently re-authenticate on next "Login" click.
    const landingUrl =
      (process.env.NEXT_PUBLIC_ADMIN_URL?.replace(/\/+$/, "") ??
        (typeof window !== "undefined" ? window.location.origin : "")) + "/";
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: landingUrl,
    });
  }

  async function handleSwitchOrg() {
    // Org switching is owned by the central launcher (/apps), not a per-app
    // page. Mirror middleware.ts's `centralSelectOrgUrl` so the user picks
    // an org on the launcher and is handed back via the normal SSO handoff.
    await updateSession({ orgId: null });
    const launcher = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
    // No /select-org fallback by design — if the launcher URL is somehow
    // unset, a home nav is the safe no-op rather than a removed route.
    window.location.href = launcher ? `${launcher}/apps` : "/";
  }

  return (
    <header className="h-16 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <AppSwitcher />
        <UserMenu
          user={{ name: fullName, email }}
          isImpersonating={isImpersonating}
          onSignOut={handleSignOut}
          items={[
            { label: "Switch Organisation", icon: ArrowLeftRight, onClick: handleSwitchOrg },
          ]}
          avatarClassName="bg-[var(--color-secondary)]"
        />
      </div>
    </header>
  );
}
