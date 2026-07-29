import { getServerSession } from "next-auth/next";

/**
 * Default landing page — replace with your app's home dashboard.
 *
 * Keep this server component (no "use client") unless you need interactivity.
 * Move data fetching into Server Components or Route Handlers under `app/api/`.
 */
export default async function HomePage() {
  // getServerSession() — always available because middleware blocks unauth users.
  // session shape (tenantId, membershipRole, user.id, etc.) is defined in
  // packages/auth/types.ts. See docs/04-db-patterns.md for tenant scoping rules.
  const session = await getServerSession();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Welcome</h1>
      <p className="mt-2 text-sm text-gray-600">
        Signed in as <span className="font-medium">{session?.user?.email}</span>
      </p>
      <p className="mt-6 text-xs text-gray-500">
        Replace this page with your app&apos;s home. See <code>docs/00-getting-started.md</code>.
      </p>
    </div>
  );
}
