"use client";

/**
 * Runs an effect exactly once per mount, even in React 18 StrictMode (dev).
 *
 * Background: in development, React intentionally double-invokes effects to
 * catch cleanup bugs. That produces duplicate network calls that show up in
 * DevTools as "why is every API called twice?". In production StrictMode is
 * off and this behavior doesn't happen — but it's confusing in dev.
 *
 * Use this ONLY for initial-data-load effects where the work is idempotent
 * and you explicitly don't want the dev double-invocation (e.g. analytics
 * fetches, one-time logs).
 *
 * Do NOT use for effects that set up subscriptions / timers — those should
 * have proper cleanup returned from `useEffect`.
 */

import { useEffect, useRef } from "react";

export function useOnceEffect(effect: () => void | (() => void), deps: React.DependencyList = []) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
