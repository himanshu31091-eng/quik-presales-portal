"use client";

import { useQuery } from "@tanstack/react-query";
import type { Action, Resource } from "@/lib/api/permissionsRegistry";
import { NAV_TO_ENTITY, isNavKey } from "@/lib/api/permissionsRegistry";

/** Mirrors quiktrack's `MyPermissions` payload. */
interface MyPermissions {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  /** "resource:action" — role grants UNION user extras. */
  permissions: string[];
  /** Subset of `permissions` that came from UserPermissionExtra. */
  extras: string[];
  /** navKeys granted via RoleNavigation. */
  navigation: string[];
}

export interface UseMyPermissionsResult {
  isAdmin: boolean;
  loading: boolean;
  roleName: string | null;
  can: (resource: Resource, action: Action) => boolean;
  hasView: (resource: string) => boolean;
  /** Sidebar visibility — same resolution order as the server's userHasNav. */
  hasNav: (navKey: string) => boolean;
}

/**
 * The caller's effective grants, for hiding UI they can't act on.
 *
 * Purely cosmetic — every server handler re-checks with `requirePermission`,
 * so a stale or tampered client cache cannot grant access.
 *
 * While loading, everything returns true so the nav doesn't visibly flicker
 * items in on first paint.
 */
export function useMyPermissions(): UseMyPermissionsResult {
  const { data, isLoading } = useQuery<MyPermissions>({
    queryKey: ["me", "permissions"],
    queryFn: async () => {
      const res = await fetch("/api/me/permissions", { cache: "no-store" });
      const json = (await res.json()) as { success: boolean; data?: MyPermissions };
      if (!json.success || !json.data) {
        return {
          isAdmin: false,
          roleId: null,
          roleName: null,
          permissions: [],
          extras: [],
          navigation: [],
        };
      }
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const granted = new Set(data?.permissions ?? []);
  const navGranted = new Set(data?.navigation ?? []);
  const isAdmin = data?.isAdmin ?? false;

  const can = (resource: Resource, action: Action) => {
    if (isLoading || isAdmin) return true;
    return granted.has(`${resource}:${action}`);
  };

  const hasView = (resource: string) => {
    if (isLoading || isAdmin) return true;
    return granted.has(`${resource}:view`);
  };

  return {
    isAdmin,
    loading: isLoading,
    roleName: data?.roleName ?? null,
    can,
    hasView,
    hasNav: (navKey: string) => {
      if (isLoading || isAdmin) return true;
      // Resource-backed nav is satisfied by the view grant, so the matrix
      // stays the single source of truth (identical to server-side userHasNav).
      const mapped = NAV_TO_ENTITY[navKey];
      if (mapped) return granted.has(`${mapped}:view`);
      if (!isNavKey(navKey)) return true;
      return navGranted.has(navKey);
    },
  };
}
