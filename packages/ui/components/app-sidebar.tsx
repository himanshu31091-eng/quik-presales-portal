"use client";

/**
 * AppSidebar — unified sidebar shared across QuikScale, QuikInfra, Admin.
 *
 * Supports:
 *   - light (brand-refresh default) + dark (legacy accent-800) themes
 *   - collapsible icon-only rail (persisted to localStorage)
 *   - 1-level submenus with accent-tinted active band
 *   - active-match by pathname prefix
 *
 * Active state uses `bg-accent-50 text-accent-700`. The `accent-*` scale is
 * driven by ThemeApplier, so per-tenant accent color flows through.
 *
 * NOTE on accessibility: we use text-accent-700 (not -600) for active text to
 * stay above ~4.5:1 contrast against accent-50 for most preset accents. Custom
 * accents may dip below WCAG AA; see docs/theming-accessibility.md.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
  children?: NavItem[];
}

export interface AppSidebarProps {
  brand: { name: string; subtitle?: string; icon?: LucideIcon };
  nav: NavItem[];
  footer?: React.ReactNode;
  /** Override — normally read from localStorage */
  theme?: "light" | "dark";
  /** localStorage key namespace; each app passes its own so users can have different prefs per app */
  storageKey?: string;
}

// Collapsed width — enough for icon + padding, no labels
const COLLAPSED_W = "w-14";
const EXPANDED_W = "w-56";

// ── Palette (light + dark) ─────────────────────────────────────────────────

type Palette = {
  sidebarBg: string;
  border: string;
  brandBlock: string;
  brandName: string;
  brandSub: string;
  menuLabel: string;
  chevronBtn: string;
  itemRest: string;
  itemHover: string;
  itemActive: string;
  iconRest: string;
  iconActive: string;
  submenuIndentLine: string;
  footer: string;
};

const LIGHT: Palette = {
  sidebarBg: "bg-white",
  border: "border-r border-gray-200",
  brandBlock: "border-b border-gray-100",
  brandName: "text-gray-900",
  brandSub: "text-gray-400",
  menuLabel: "text-gray-400",
  chevronBtn: "text-gray-400 hover:text-gray-700 hover:bg-gray-100",
  itemRest: "text-gray-700",
  itemHover: "hover:bg-gray-50",
  itemActive: "bg-accent-50 text-accent-700",
  iconRest: "text-gray-500",
  iconActive: "text-accent-700",
  submenuIndentLine: "border-gray-200",
  footer: "text-gray-400 border-t border-gray-100",
};

const DARK: Palette = {
  sidebarBg: "bg-accent-800",
  border: "",
  brandBlock: "border-b border-white/10",
  brandName: "text-white",
  brandSub: "text-white/50",
  menuLabel: "text-white/50",
  chevronBtn: "text-white/60 hover:text-white hover:bg-white/10",
  itemRest: "text-white/75",
  itemHover: "hover:bg-white/10 hover:text-white",
  itemActive: "bg-white/15 text-white",
  iconRest: "text-white/70",
  iconActive: "text-white",
  submenuIndentLine: "border-white/10",
  footer: "text-white/40 border-t border-white/10",
};

// ── Component ──────────────────────────────────────────────────────────────

export function AppSidebar({ brand, nav, footer, theme: themeProp, storageKey = "sidebar" }: AppSidebarProps) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(themeProp ?? "light");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage after mount (SSR-safe)
  useEffect(() => {
    setMounted(true);
    try {
      const c = localStorage.getItem(`${storageKey}.collapsed`);
      if (c === "true") setCollapsed(true);
      if (!themeProp) {
        const t = localStorage.getItem(`${storageKey}.theme`);
        if (t === "dark" || t === "light") setTheme(t);
      }
    } catch { /* localStorage blocked */ }
  }, [storageKey, themeProp]);

  // Persist collapse
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(`${storageKey}.collapsed`, String(collapsed)); } catch { /* noop */ }
  }, [collapsed, mounted, storageKey]);

  // Auto-open group if a child is active
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of nav) {
      if (item.children?.some(c => c.href && pathname.startsWith(c.href))) {
        next[item.label] = true;
      }
    }
    setOpenGroups(prev => ({ ...next, ...prev }));
    // only run when pathname / nav changes; we intentionally don't reset user-opened groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const p = theme === "dark" ? DARK : LIGHT;

  function isActive(href?: string) {
    if (!href) return false;
    // exact match OR child-route match (but avoid `/projects` matching `/projects-other`)
    if (pathname === href) return true;
    return pathname.startsWith(`${href}/`);
  }

  function hasActiveChild(item: NavItem) {
    return item.children?.some(c => isActive(c.href)) ?? false;
  }

  const BrandIcon = brand.icon;

  return (
    <aside className={`${collapsed ? COLLAPSED_W : EXPANDED_W} ${p.sidebarBg} ${p.border} flex-shrink-0 flex flex-col transition-[width] duration-200 ease-out`}>
      {/* Brand block */}
      <div className={`${p.brandBlock} ${collapsed ? "px-2 py-3" : "px-4 py-3"} flex items-center gap-2 min-h-[56px]`}>
        {BrandIcon && (
          <div className={`w-8 h-8 rounded ${theme === "dark" ? "bg-white/10" : "bg-accent-50 text-accent-700"} flex items-center justify-center flex-shrink-0`}>
            <BrandIcon className="h-4 w-4" />
          </div>
        )}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold leading-tight truncate ${p.brandName}`}>{brand.name}</div>
            {brand.subtitle && <div className={`text-[10px] uppercase tracking-wider ${p.brandSub} truncate`}>{brand.subtitle}</div>}
          </div>
        )}
      </div>

      {/* MENU label + collapse toggle */}
      <div className={`${collapsed ? "px-2 justify-center" : "px-4 justify-between"} py-3 flex items-center`}>
        {!collapsed && <span className={`text-[10px] font-semibold uppercase tracking-widest ${p.menuLabel}`}>Menu</span>}
        <button
          onClick={() => setCollapsed(c => !c)}
          className={`p-1 rounded ${p.chevronBtn} transition-colors`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden">
        {nav.map(item => {
          const Icon = item.icon;
          const active = isActive(item.href) || hasActiveChild(item);
          const isGroup = !!item.children?.length;
          const isOpen = openGroups[item.label] ?? hasActiveChild(item);

          // group parent (expandable)
          if (isGroup) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => setOpenGroups(prev => ({ ...prev, [item.label]: !isOpen }))}
                  className={`w-full flex items-center gap-3 ${collapsed ? "px-2 justify-center" : "px-4"} py-2.5 text-sm text-left transition-colors ${active ? p.itemActive : `${p.itemRest} ${p.itemHover}`}`}
                  title={collapsed ? item.label : undefined}
                >
                  {Icon && <Icon className={`h-4 w-4 flex-shrink-0 ${active ? p.iconActive : p.iconRest}`} />}
                  {!collapsed && <span className="flex-1 min-w-0 truncate">{item.label}</span>}
                  {!collapsed && (
                    <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""} ${active ? p.iconActive : p.iconRest}`} />
                  )}
                </button>
                {isOpen && !collapsed && (
                  <div className="pb-1">
                    {item.children!.map(child => {
                      const childActive = isActive(child.href);
                      return (
                        <Link
                          key={child.label}
                          href={child.href ?? "#"}
                          className={`flex items-center gap-3 pl-12 pr-4 py-2 text-sm transition-colors ${childActive ? p.itemActive : `${p.itemRest} ${p.itemHover}`}`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // leaf item
          return (
            <Link
              key={item.label}
              href={item.href ?? "#"}
              className={`flex items-center gap-3 ${collapsed ? "px-2 justify-center" : "px-4"} py-2.5 text-sm transition-colors ${active ? p.itemActive : `${p.itemRest} ${p.itemHover}`}`}
              title={collapsed ? item.label : undefined}
            >
              {Icon && <Icon className={`h-4 w-4 flex-shrink-0 ${active ? p.iconActive : p.iconRest}`} />}
              {!collapsed && <span className="flex-1 min-w-0 truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {footer && !collapsed && (
        <div className={`px-4 py-3 text-[10px] ${p.footer}`}>{footer}</div>
      )}
    </aside>
  );
}
