"use client";

import { useEffect, useState } from "react";

/**
 * useOrgInfo — the active org's identity (id, name, slug).
 *
 * Backed by `/api/org/info`, a single-table read. The value is stable for the
 * session, so it's cached at module scope: the header remounts on every
 * dashboard route change, and without this each navigation would refetch.
 *
 * `inflight` collapses concurrent first-callers onto one request. Mirrors the
 * pattern in apps/quikscale/lib/hooks/useOrgInfo.ts.
 */

export interface OrgInfo {
  id: string;
  name: string;
  slug?: string | null;
}

let cache: OrgInfo | null = null;
let inflight: Promise<OrgInfo | null> | null = null;
const listeners = new Set<() => void>();

async function fetchOrg(): Promise<OrgInfo | null> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = fetch("/api/org/info")
    .then((r) => r.json())
    .then((j: { success?: boolean; data?: OrgInfo }) => {
      if (j?.success && j.data?.name) {
        cache = { id: j.data.id, name: j.data.name, slug: j.data.slug };
        listeners.forEach((l) => l());
        return cache;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Clear the cache and refetch — call after an org rename. */
export function invalidateOrgInfoCache(): void {
  cache = null;
  void fetchOrg();
}

export function useOrgInfo(): OrgInfo | null {
  const [org, setOrg] = useState<OrgInfo | null>(cache);

  useEffect(() => {
    const sync = () => setOrg(cache);
    listeners.add(sync);
    void fetchOrg().then(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return org;
}
