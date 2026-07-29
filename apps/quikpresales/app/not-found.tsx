import Link from "next/link";

/**
 * Root 404. Deliberately styled inline rather than with the app chrome — a
 * 404 can be hit unauthenticated (before the dashboard layout, its sidebar and
 * the org accent colour exist), so it must render standalone.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-gray-400">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        That page doesn&apos;t exist in QuikPreSales. It may have been moved, or the link
        may be out of date.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Go to dashboard
        </Link>
        <Link
          href="/"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
