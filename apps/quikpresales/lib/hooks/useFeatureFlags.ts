"use client";

import { useEffect, useState } from "react";

/**
 * Disabled-module lookup for the sidebar.
 *
 * Three-level cache so the ~dozen components that can mount in one tick don't
 * each fire their own request:
 *   1. module-level memory cache (survives navigation within the SPA)
 *   2. localStorage, 5-minute TTL (survives a reload)
 *   3. the server
 *
 * SSR deliberately returns an EMPTY set — rendering the full nav on the server
 * and pruning it after hydration avoids a hydration mismatch. The alternative
 * (blocking SSR on the flag fetch) costs a round trip on every page.
 */
const STORAGE_KEY = "ff:me:quikpresales:v1";
const TTL_MS = 5 * 60 * 1000;

interface CachedPayload {
  disabledKeys: string[];
  fetchedAt: number;
}

let memoryCache: CachedPayload | null = null;
let pending: Promise<string[]> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function readStorage(): CachedPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!Array.isArray(parsed.disabledKeys) || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    // Corrupt or unavailable storage (private mode, quota) — treat as a miss.
    return null;
  }
}

function writeStorage(payload: CachedPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal: the memory cache still works for this session.
  }
}

function isFresh(payload: CachedPayload | null): payload is CachedPayload {
  return !!payload && Date.now() - payload.fetchedAt < TTL_MS;
}

async function fetchDisabledKeys(): Promise<string[]> {
  if (pending) return pending;

  pending = (async () => {
    try {
      const res = await fetch("/api/feature-flags/me", { cache: "no-store" });
      const json = (await res.json()) as {
        success: boolean;
        data?: { disabledKeys?: string[] };
      };
      const keys = json.success ? json.data?.disabledKeys ?? [] : [];
      const payload: CachedPayload = { disabledKeys: keys, fetchedAt: Date.now() };
      memoryCache = payload;
      writeStorage(payload);
      notify();
      return keys;
    } catch {
      // Fail open — a flag-service outage must not hide the whole product.
      return [];
    } finally {
      pending = null;
    }
  })();

  return pending;
}

/** Drop every cache level. Call after a super-admin toggles a module. */
export function invalidateFeatureFlagsCache(): void {
  memoryCache = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  void fetchDisabledKeys();
}

/**
 * Set of disabled module keys for the current org. Empty during SSR and on
 * the first client render, then populated after the effect runs.
 */
export function useDisabledModules(): Set<string> {
  const [keys, setKeys] = useState<string[]>(() =>
    isFresh(memoryCache) ? memoryCache.disabledKeys : [],
  );

  useEffect(() => {
    const sync = () => setKeys(memoryCache?.disabledKeys ?? []);
    listeners.add(sync);

    if (isFresh(memoryCache)) {
      sync();
    } else {
      const stored = readStorage();
      if (isFresh(stored)) {
        memoryCache = stored;
        sync();
      } else {
        void fetchDisabledKeys();
      }
    }

    return () => {
      listeners.delete(sync);
    };
  }, []);

  return new Set(keys);
}
