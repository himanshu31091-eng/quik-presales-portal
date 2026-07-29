"use client";

/**
 * Super Admin layout — wraps all /super/* routes.
 *
 * Checks that the user is a super_admin (platform-level, not org-level).
 * If not, redirects to /apps.
 */

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutGrid,
  CreditCard,
  Users,
  Shield,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  ToggleRight,
  BarChart3,
  Megaphone,
  LayoutDashboard,
} from "lucide-react";
import { AppSwitcher, UserMenu, globalSignOut } from "@quikit/ui";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Organizations", href: "/organizations", icon: Building2 },
  { label: "App Registry", href: "/app-registry", icon: LayoutGrid },
  { label: "App Feature Flags", href: "/feature-flags", icon: ToggleRight },
  { label: "Pricing & Plans", href: "/pricing", icon: CreditCard },
  { label: "Users", href: "/platform-users", icon: Users },
  { label: "Broadcasts", href: "/broadcasts", icon: Megaphone },
  { label: "Audit Log", href: "/audit", icon: FileText },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isSuperAdmin = session?.user?.isSuperAdmin === true;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && !isSuperAdmin) {
      router.push("/apps");
    }
  }, [status, isSuperAdmin, router]);

  const userFullName = session?.user?.name || session?.user?.email?.split("@")[0] || "Super Admin";
  const userEmail = session?.user?.email || "";
  const isImpersonating = session?.user?.impersonating === true;

  async function handleSignOut() {
    // Single-logout: clear launcher cookie, auth-host cookie, AND launcher
    // SLO cookies. authn.quikit.ai is a SEPARATE origin from apps.quikit.ai
    // (the IdP-on-same-host assumption from the legacy single-host
    // architecture is stale), so authUrl must be passed explicitly.
    const launcherUrl =
      process.env.NEXT_PUBLIC_QUIKIT_URL?.replace(/\/+$/, "") ??
      (typeof window !== "undefined" ? window.location.origin : "");
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: launcherUrl,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: `${launcherUrl}/`,
    });
  }

  async function handleExitImpersonation() {
    // Super admins on quikit can't be impersonating themselves in this app,
    // but keep the handler wired for completeness + future multi-tenant
    // super-admin scenarios.
    try {
      const r = await fetch("/api/auth/impersonate/exit", { method: "POST" });
      const j = await r.json();
      window.location.href = j?.data?.redirectUrl || "/";
    } catch {
      window.location.href = "/";
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  const sidebarContent = (
    <>
      {/* Logo area */}
      <div className="px-4 py-5 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <p className="text-sm font-bold tracking-tight text-slate-900">
                  QuikIT
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Super Admin</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Main Menu
          </p>
        )}
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-white text-slate-900 font-semibold shadow-sm border border-white/80"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? "bg-amber-100 text-amber-700" : ""}`}>
                <Icon className="h-4 w-4" />
              </div>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className="hidden md:block px-2 py-3 border-t border-slate-200/60">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:bg-white/60 hover:text-slate-900 text-sm transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-amber-50 via-orange-50/30 to-slate-100">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 232 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="hidden md:flex flex-shrink-0 bg-white/50 backdrop-blur-md border-r border-white/60 text-slate-900 flex-col overflow-hidden"
      >
        {sidebarContent}
      </motion.aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -232 }}
              animate={{ x: 0 }}
              exit={{ x: -232 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="fixed inset-y-0 left-0 z-50 w-[232px] bg-white text-slate-900 flex flex-col md:hidden shadow-xl"
            >
              <div className="absolute top-4 right-3">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header bar */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/40 bg-white/40 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-slate-900">
              Super Admin
            </span>
          </div>

          <div className="flex items-center gap-3">
            <AppSwitcher apiUrl="/api/apps/launcher" />
            <UserMenu
              user={{ name: userFullName, email: userEmail }}
              isImpersonating={isImpersonating}
              onSignOut={handleSignOut}
              onExitImpersonation={handleExitImpersonation}
              items={[
                { label: "Back to launcher", icon: LayoutDashboard, onClick: () => router.push("/apps") },
              ]}
              avatarClassName="bg-gradient-to-br from-amber-500 to-orange-600"
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
