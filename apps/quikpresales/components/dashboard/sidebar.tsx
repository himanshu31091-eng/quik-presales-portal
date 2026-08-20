"use client";

import {
  LayoutDashboard,
  Inbox,
  Briefcase,
  FileSearch,
  FileText,
  Calculator,
  Library,
  LayoutTemplate,
  MonitorPlay,
  BookOpen,
  Trophy,
  CalendarRange,
  Users,
  Settings,
  Presentation,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { AppSidebar, type NavItem } from "@quikit/ui";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";
import { useDisabledModules } from "@/lib/hooks/useFeatureFlags";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import type { Resource } from "@/lib/api/permissionsRegistry";

/**
 * QuikPreSales sidebar.
 *
 * Renders the shared `AppSidebar` from @quikit/ui (same component quikscale /
 * quikinfra / admin use) — no local copy.
 *
 * The nav below mirrors the `quikpresales` entry in MODULE_REGISTRY. An item
 * renders only when BOTH hold:
 *   - its moduleKey (and every ancestor) is enabled for the org, and
 *   - the user holds `view` on the backing resource.
 * Admins bypass the permission half; the module gate always applies.
 */

interface Entry {
  label: string;
  href?: string;
  icon: LucideIcon;
  moduleKey: string;
  /** Resource whose `view` grant controls visibility. Omit for always-visible. */
  resource?: Resource;
  children?: Entry[];
}

const NAV: Entry[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, moduleKey: "dashboard", resource: "dashboard" },
  { label: "Leads", href: "/leads", icon: Inbox, moduleKey: "leads", resource: "engagements" },
  { label: "Engagements", href: "/engagements", icon: Briefcase, moduleKey: "engagements", resource: "engagements" },
  { label: "RFP Manager", href: "/rfps", icon: FileSearch, moduleKey: "rfp", resource: "rfp" },
  { label: "Proposals", href: "/proposals", icon: FileText, moduleKey: "proposals", resource: "proposals" },
  { label: "Cost Estimator", href: "/estimates", icon: Calculator, moduleKey: "estimates", resource: "estimates" },
  {
    label: "Library",
    icon: Library,
    moduleKey: "library",
    children: [
      { label: "Templates", href: "/templates", icon: LayoutTemplate, moduleKey: "library.templates", resource: "templates" },
      { label: "Demo Library", href: "/demos", icon: MonitorPlay, moduleKey: "library.demos", resource: "demos" },
      { label: "Knowledge", href: "/knowledge", icon: BookOpen, moduleKey: "library.knowledge", resource: "knowledge" },
    ],
  },
  { label: "Win / Loss", href: "/winloss", icon: Trophy, moduleKey: "winloss", resource: "winloss" },
  { label: "Reports", href: "/reports", icon: BarChart3, moduleKey: "reports", resource: "dashboard" },
  { label: "Weekly Dashboard", href: "/weekly", icon: CalendarRange, moduleKey: "weekly", resource: "dashboard" },
  { label: "Team Overview", href: "/team", icon: Users, moduleKey: "team", resource: "dashboard" },
  { label: "Settings", href: "/settings/roles", icon: Settings, moduleKey: "settings", resource: "settings" },
];

function toNavItems(
  entries: Entry[],
  disabled: Set<string>,
  hasNav: (navKey: string) => boolean,
): NavItem[] {
  // Visibility is resolved by moduleKey through `hasNav`, which applies the
  // same rule as the server's userHasNav: resource-backed keys fall back to the
  // `view` grant, pure-navigation keys need a RoleNavigation row.
  const visible = (e: Entry) => {
    if (!isModuleEnabled(e.moduleKey, disabled)) return false;
    return hasNav(e.moduleKey);
  };

  return entries.reduce<NavItem[]>((acc, entry) => {
    if (!isModuleEnabled(entry.moduleKey, disabled)) return acc;

    if (entry.children) {
      const children = entry.children.filter(visible);
      // Prune section headers that have nothing left underneath them.
      if (children.length === 0) return acc;
      acc.push({
        label: entry.label,
        icon: entry.icon,
        children: children.map((c) => ({ label: c.label, href: c.href, icon: c.icon })),
      });
      return acc;
    }

    if (!visible(entry)) return acc;
    acc.push({ label: entry.label, href: entry.href, icon: entry.icon });
    return acc;
  }, []);
}

export function Sidebar() {
  const disabled = useDisabledModules();
  const { hasNav } = useMyPermissions();

  return (
    <div
      className="[&>aside]:!bg-accent-100
        [&_nav_.bg-accent-50]:!bg-accent-600 [&_nav_.text-accent-700]:!text-white"
    >
      <AppSidebar
        brand={{ name: "QuikPreSales", subtitle: "Pre-Sales Portal", icon: Presentation }}
        nav={toNavItems(NAV, disabled, hasNav)}
        // Keep the light palette's readable controls while the wrapper supplies
        // the app's light-blue, tenant-theme-aware sidebar surface. The nav-scoped
        // overrides bump the active item to a solid accent-600 pill — on its own,
        // the palette's default bg-accent-50 active highlight is nearly invisible
        // against this bg-accent-100 sidebar. Scoped to `nav` so it doesn't also
        // repaint the brand icon chip above, which reuses the same accent-50/700 pair.
        theme="light"
        storageKey="quikpresales:sidebar"
      />
    </div>
  );
}
