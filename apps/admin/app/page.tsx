import { redirect } from "next/navigation";

/**
 * Root entry point.
 *
 * Always redirects to /dashboard. The middleware in this app runs *before*
 * page rendering (matcher includes "/") and is responsible for the auth
 * branch:
 *   - Authenticated user → middleware lets the request through; this page
 *     redirects to /dashboard. Single hop.
 *   - Unauthenticated user → middleware redirects to the central login URL
 *     (or local /login) BEFORE this page even renders.
 *
 * Avoiding a `getServerSession` call here removes the only piece of
 * server-side blocking work between the launcher click and the dashboard
 * compile starting — meaningful on the first visit each time the dev
 * server cold-starts.
 */
export default function RootPage() {
  redirect("/dashboard");
}
