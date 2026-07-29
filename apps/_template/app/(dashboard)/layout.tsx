/**
 * Dashboard layout — wraps every authenticated route in your app.
 *
 * The route group `(dashboard)` does not appear in the URL — it's purely an
 * organizational wrapper. Auth is enforced by middleware.ts at the edge; if
 * code reaches here, the user has a valid session.
 *
 * Common additions to make here (uncomment + import when needed):
 *   - <Sidebar /> from your own components (or copy quikscale's pattern).
 *   - <Header /> with logout, theme switch, tenant info.
 *   - <Toaster /> for toast notifications.
 */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main>{children}</main>
    </div>
  );
}
