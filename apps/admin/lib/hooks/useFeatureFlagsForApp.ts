"use client";

import { useQuery } from "@tanstack/react-query";

interface FeatureFlagsResponse {
  success: boolean;
  data: { disabled: string[] };
}

export function useDisabledModules(): Set<string> {
  const { data } = useQuery<FeatureFlagsResponse>({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const res = await fetch("/api/feature-flags/me");
      if (!res.ok) return { success: true, data: { disabled: [] } };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,   // matches server-side FEATURE_FLAGS_CACHE_TTL (300s)
    gcTime: 15 * 60 * 1000,     // keep in memory 15 min — avoids loading flicker on revisit
    refetchOnWindowFocus: false, // module config rarely changes mid-session
    retry: false,                // failure is fine — all modules stay visible
  });

  return new Set(data?.data?.disabled ?? []);
}

export function isModuleEnabled(moduleKey: string, disabled: Set<string>): boolean {
  return !disabled.has(moduleKey);
}
