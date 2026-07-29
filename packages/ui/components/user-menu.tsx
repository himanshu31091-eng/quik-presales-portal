"use client";

/**
 * UserMenu — shared avatar + dropdown used by every QuikIT app
 * (quikit launcher, quikit super-admin, quikscale, admin).
 *
 * Structure (top→bottom):
 *   1. Avatar + name + email trigger
 *   2. Dropdown header (name, email) — auto-rendered
 *   3. Custom items (Switch org, Settings, …) — via `items` prop
 *   4. Last row: "Sign out" (or "Exit impersonation" when impersonating)
 *
 * Impersonation-aware: pass `isImpersonating` + `onExitImpersonation` and
 * the last-row action becomes "Exit impersonation" (amber) instead of
 * "Sign out" (red). Super admin can't accidentally sign out of their
 * real account while viewing-as another user.
 *
 * For true Single Logout (SLO) across the platform, apps should wrap
 * their `onSignOut` in the `globalSignOut` helper (see global-signout.ts).
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, ChevronDown } from "lucide-react";
import type { ElementType } from "react";
import { cn } from "../lib/utils";

export interface UserMenuItem {
  label: string;
  icon: ElementType;
  onClick: () => void | Promise<void>;
  /** If true, renders with red text (destructive action). */
  destructive?: boolean;
}

export interface UserMenuProps {
  user: {
    name: string;
    email: string;
    /** Optional pre-computed initials. Otherwise derived from `name`. */
    initials?: string;
  };
  /** Called when the last-row button is clicked in the normal case. */
  onSignOut: () => void | Promise<void>;
  /** When true, last-row action becomes "Exit impersonation". */
  isImpersonating?: boolean;
  /** Required when `isImpersonating` is true. */
  onExitImpersonation?: () => void | Promise<void>;
  /** Extra menu items rendered between the dropdown header and the last-row action. */
  items?: UserMenuItem[];
  /** Tailwind class for the avatar circle (e.g. "bg-accent-600", "bg-gradient-to-br from-amber-500 to-orange-600"). */
  avatarClassName?: string;
  /** Horizontal alignment of the dropdown relative to the trigger. */
  align?: "left" | "right";
  /** Hide the name/email on the trigger (useful on mobile). */
  compact?: boolean;
  /**
   * Render with dark surfaces instead of the default light theme.
   * Default: false (existing behavior). Apps that ship a dark page chrome
   * (e.g. the launcher's spotlight background) should opt in.
   */
  dark?: boolean;
}

function computeInitials(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "U";
  return trimmed
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserMenu({
  user,
  onSignOut,
  isImpersonating = false,
  onExitImpersonation,
  items = [],
  avatarClassName = "bg-accent-600",
  align = "right",
  compact = false,
  dark = false,
}: UserMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const initials = user.initials || computeInitials(user.name);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleLogoutClick() {
    setOpen(false);
    if (isImpersonating && onExitImpersonation) {
      await onExitImpersonation();
    } else {
      await onSignOut();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
          dark ? "hover:bg-white/5" : "hover:bg-gray-50",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm",
            avatarClassName,
          )}
        >
          {initials}
        </div>
        {!compact && (
          <div className="hidden sm:block text-left min-w-0">
            <p
              className={cn(
                "text-sm font-medium leading-tight truncate max-w-[10rem]",
                dark ? "text-zinc-100" : "text-gray-900",
              )}
            >
              {user.name}
            </p>
            <p
              className={cn(
                "text-xs leading-tight truncate max-w-[10rem]",
                dark ? "text-zinc-400" : "text-gray-500",
              )}
            >
              {user.email}
            </p>
          </div>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform flex-shrink-0",
            dark ? "text-zinc-500" : "text-gray-400",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && mounted && (
          <>
            {/* Invisible backdrop for outside-click on mobile */}
            <div
              className="fixed inset-0 z-[999]"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "absolute top-full mt-1 w-60 rounded-lg shadow-lg py-1 overflow-hidden",
                "z-[1000]",
                dark
                  ? "bg-zinc-900/95 backdrop-blur-md border border-white/10 shadow-2xl"
                  : "bg-white border border-gray-200",
                align === "right" ? "right-0" : "left-0",
              )}
            >
              {/* Header — name + email */}
              <div
                className={cn(
                  "px-4 py-3 border-b",
                  dark ? "border-white/10" : "border-gray-100",
                )}
              >
                <p
                  className={cn(
                    "text-sm font-medium truncate",
                    dark ? "text-zinc-100" : "text-gray-900",
                  )}
                >
                  {user.name}
                </p>
                <p
                  className={cn(
                    "text-xs truncate",
                    dark ? "text-zinc-400" : "text-gray-500",
                  )}
                >
                  {user.email}
                </p>
                {isImpersonating && (
                  <p
                    className={cn(
                      "mt-1 text-[10px] uppercase tracking-wider font-semibold",
                      dark ? "text-amber-300" : "text-amber-700",
                    )}
                  >
                    Impersonation active
                  </p>
                )}
              </div>

              {/* Custom items (switch org, settings, …) */}
              {items.length > 0 && (
                <div className="py-1">
                  {items.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={i}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpen(false);
                          void item.onClick();
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
                          item.destructive
                            ? dark
                              ? "text-red-400 hover:bg-red-500/10"
                              : "text-red-600 hover:bg-red-50"
                            : dark
                              ? "text-zinc-200 hover:bg-white/5"
                              : "text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            item.destructive
                              ? ""
                              : dark
                                ? "text-zinc-400"
                                : "text-gray-400",
                          )}
                        />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Last row — sign out OR exit impersonation */}
              <div
                className={cn(
                  "border-t py-1",
                  dark ? "border-white/10" : "border-gray-100",
                )}
              >
                {isImpersonating ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogoutClick}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors font-medium",
                      dark
                        ? "text-amber-300 hover:bg-amber-500/10"
                        : "text-amber-700 hover:bg-amber-50",
                    )}
                  >
                    <LogOut className="h-4 w-4" />
                    Exit impersonation
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogoutClick}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
                      dark
                        ? "text-red-400 hover:bg-red-500/10"
                        : "text-red-600 hover:bg-red-50",
                    )}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
