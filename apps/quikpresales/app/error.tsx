"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * `error.message` is deliberately not rendered: a server error can carry a
 * Prisma message or a stack fragment, and this boundary is reachable by any
 * authenticated user. The digest is enough to correlate with server logs.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[quikpresales] route error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        This page failed to load. Try again — if it keeps happening, quote the reference
        below to support.
      </p>
      {error.digest ? (
        <code className="mt-3 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
          {error.digest}
        </code>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Try again
      </button>
    </main>
  );
}
