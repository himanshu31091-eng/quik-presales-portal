"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, Menu, Settings } from "lucide-react";
import { AppSwitcher, UserMenu, globalSignOut } from "@quikit/ui";
import { useOrgInfo } from "@/lib/hooks/useOrgInfo";

interface HeaderProps {
  onMenuClick?: () => void;
}

/**
 * App header. Composition mirrors apps/quikscale/components/dashboard/header.tsx:
 * mobile menu + greeting + active-org chip on the left, AppSwitcher + shared
 * UserMenu on the right.
 *
 * Sign-out goes through `globalSignOut`, which clears the session across every
 * QuikIT app — next-auth's local `signOut` would leave the user logged in
 * everywhere else.
 */
export function Header({ onMenuClick }: HeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const org = useOrgInfo();

  const user = session?.user;
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Signed in";
  const email = user?.email ?? "";
  const isImpersonating = user?.impersonating === true;

  async function handleSignOut() {
    const landingUrl =
      (process.env.NEXT_PUBLIC_QUIKPRESALES_URL?.replace(/\/+$/, "") ??
        (typeof window !== "undefined" ? window.location.origin : "")) + "/";

    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: landingUrl,
    });
  }

  async function handleExitImpersonation() {
    // The launcher owns impersonation; it returns where to land afterwards.
    try {
      const r = await fetch("/api/auth/impersonate/exit", { method: "POST" });
      const j = (await r.json()) as { data?: { redirectUrl?: string } };
      window.location.href = j?.data?.redirectUrl || "/dashboard";
    } catch {
      window.location.href = "/dashboard";
    }
  }

  return (
    <header className="relative z-[100] flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        {onMenuClick ? (
          <button
            onClick={onMenuClick}
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 md:hidden"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}

        <h1 className="text-base font-semibold text-gray-900">
          Welcome, {fullName.split(" ")[0]}!
        </h1>

        {/* Active-org chip — multi-org members must always be able to see which
            tenant they're operating in. Hidden on very small screens so the
            header doesn't wrap. */}
        {org?.name ? (
          <span
            className="hidden max-w-[220px] items-center gap-1.5 whitespace-nowrap rounded-full border border-accent-100 bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700 sm:inline-flex"
            title={org.name}
          >
            <Building2 className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{org.name}</span>
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <AppSwitcher />
        <UserMenu
          user={{ name: fullName, email }}
          isImpersonating={isImpersonating}
          onSignOut={handleSignOut}
          onExitImpersonation={handleExitImpersonation}
          items={[{ label: "Settings", icon: Settings, onClick: () => router.push("/settings") }]}
          avatarClassName="bg-accent-600"
        />
      </div>
    </header>
  );
}
