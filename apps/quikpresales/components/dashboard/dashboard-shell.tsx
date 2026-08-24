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

      {/* Skip link — first focusable element on the page, so keyboard users can
          jump past a 12+ item sidebar instead of tabbing through it on every
          navigation. Visually hidden until focused (WCAG 2.4.1). */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="flex h-screen bg-[var(--color-bg-secondary)]">
        {/* Desktop: sidebar always present. Mobile: off-canvas drawer. */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {mobileOpen ? (
          // items-start (rather than the flex default of stretch) lets the drawer
          // hug its nav content's height instead of filling the full viewport —
          // scoped to this app's mobile drawer only, not the shared AppSidebar.
          <div className="fixed inset-0 z-[200] flex items-start md:hidden">
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
          {/* tabIndex={-1} so the skip link can move focus here, not just scroll. */}
          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-6 focus:outline-none">
            {children}
          </main>
        </div>
      </div>
    </SessionGuard>
  );
}
