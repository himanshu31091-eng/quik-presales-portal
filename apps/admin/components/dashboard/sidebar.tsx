"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useDisabledModules } from "@/lib/hooks/useFeatureFlagsForApp";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";
import { PATHS } from "@/lib/constants";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  LayoutGrid,
  Shield,
  ClipboardList,
  Settings,
} from "lucide-react";

const navItems = [
  { key: "overview",   label: "Overview",   href: PATHS.dashboard,  icon: LayoutDashboard },
  { key: "members",    label: "Members",    href: PATHS.members,    icon: Users },
  { key: "teams",      label: "Teams",      href: PATHS.teams,      icon: UsersRound },
  { key: "apps",       label: "Apps",       href: PATHS.apps,       icon: LayoutGrid },
  { key: "roles",      label: "Roles",      href: PATHS.roles,      icon: Shield },
  { key: "audit-log",  label: "Audit Log",  href: PATHS.auditLog,   icon: ClipboardList },
  { key: "settings",   label: "Settings",   href: PATHS.settings,   icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const disabled = useDisabledModules();
  const { resolvedTheme } = useTheme();

  // Theme-aware brand mark. next-themes returns `undefined` on the server /
  // first client render, so we gate on `mounted` to avoid a hydration
  // mismatch and default to the dark-badge monogram (the light-theme asset).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const logoSrc =
    mounted && resolvedTheme === "dark"
      ? "/brand/admin-light.svg" // white badge — reads on the dark sidebar
      : "/brand/admin.svg"; // dark badge — reads on the light sidebar

  const visibleItems = navItems.filter((item) => isModuleEnabled(item.key, disabled));

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-primary)]">
      <div className="flex h-14 items-center gap-2.5 border-b border-[var(--color-border)] px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt="Admin Portal"
          className="h-7 w-7 rounded-lg object-contain"
        />
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-tight">Admin Portal</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {visibleItems.map(({ key, label, href, icon: Icon }) => {
          const active =
            href === PATHS.dashboard
              ? pathname === href
              : pathname.startsWith(href);
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-[var(--color-secondary-light)] text-[var(--color-secondary)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] p-3">
        <p className="px-3 text-xs text-[var(--color-text-tertiary)]">QuikIT Platform v1.0</p>
      </div>
    </aside>
  );
}
