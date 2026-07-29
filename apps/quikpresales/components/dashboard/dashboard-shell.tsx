"use client";

import { useState } from "react";
import { FeatureDisabledToast, ImpersonationBanner } from "@quikit/ui";
import { ThemeApplier } from "@quikit/ui/theme-applier";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { SessionGuard } from "@/components/session-guard";

/**
 * Client shell for the dashboard.
 *
 * The server layout runs the app-access gate BEFORE rendering this, so a user
 * without quikpresales access never sees this chrome — not even for a frame.
 * `SessionGuard` is the live-revocation backstop for access lost while the
 * user is already inside.
 *
 * Composition mirrors apps/quikscale/components/dashboard/dashboard-shell.tsx:
 *   SessionGuard  — polls /api/session/validate
 *   ThemeApplier  — writes --accent-* from /api/settings/company
 *   ImpersonationBanner — visible bar while a super admin is viewing-as
 *   FeatureDisabledToast — explains a 404 caused by a disabled module
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SessionGuard>
      <ThemeApplier />
      <ImpersonationBanner />
      <FeatureDisabledToast />

      <div className="flex h-screen bg-[var(--color-bg-secondary)]">
        {/* Desktop: sidebar always present. Mobile: off-canvas drawer. */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-[200] flex md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative z-10" onClick={() => setMobileOpen(false)}>
              <Sidebar />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header onMenuClick={() => setMobileOpen((v) => !v)} />
          <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </SessionGuard>
  );
}
