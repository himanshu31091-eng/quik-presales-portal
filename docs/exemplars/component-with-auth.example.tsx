/**
 * Annotated reference: a typical authenticated screen.
 *
 * Mixes a server component (data fetch from session + DB) with a client child
 * (interactivity via React Query). Shows the canonical patterns: provider
 * usage, @quikit/ui imports, accent theming, loading states, empty states.
 *
 * ⚠ Reference only. Not buildable from this directory.
 */

/* ============================================================================
 * SERVER COMPONENT — apps/<your-app>/app/(dashboard)/widgets/page.tsx
 * ========================================================================= */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { Card, EmptyState, AddButton } from "@quikit/ui";
import { WidgetList } from "@/components/widget-list";

export default async function WidgetsPage() {
  // Middleware already guarantees auth — but always re-check on the server when
  // making security-relevant decisions (defence in depth). Pass authOptions so
  // getServerSession returns the augmented session (orgId, membershipRole, …).
  const session = await getServerSession(authOptions);
  if (!session?.user?.orgId) redirect("/login");

  // Initial server-side fetch. The list keeps re-fetching client-side via
  // React Query when the user paginates / filters, so this is the SSR seed.
  const initialWidgets = await db.widget.findMany({
    where: { orgId: session.user.orgId },
    select: { id: true, name: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Widgets</h1>
          <p className="text-sm text-gray-500 mt-1">
            All widgets in {session.user.name ?? "your organization"}
          </p>
        </div>

        {/* Themeable button — accent-* classes inside @quikit/ui's AddButton */}
        <AddButton href="/widgets/new" label="New widget" />
      </header>

      {/* Pass server-fetched data to a client child for interactivity */}
      {initialWidgets.length === 0 ? (
        <Card>
          <EmptyState
            title="No widgets yet"
            description="Create your first widget to get started."
            actionLabel="New widget"
            actionHref="/widgets/new"
          />
        </Card>
      ) : (
        <WidgetList initialData={initialWidgets} />
      )}
    </div>
  );
}

/* ============================================================================
 * CLIENT COMPONENT — apps/<your-app>/components/widget-list.tsx
 * ========================================================================= */

/*
"use client";

import { useQuery } from "@tanstack/react-query";
import { DataTable, type DataTableColumn, Badge, Skeleton, formatRelativeDate } from "@quikit/ui";
import { cn } from "@/lib/utils";

interface Widget {
  id: string;
  name: string;
  status: "draft" | "active" | "completed";
  createdAt: string;
}

interface WidgetListProps {
  initialData: Widget[];
}

const STATUS_TONE: Record<Widget["status"], string> = {
  // SEMANTIC colors (not themeable). Once chosen, lock these per status.
  draft:     "bg-gray-100 text-gray-700",
  active:    "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

export function WidgetList({ initialData }: WidgetListProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["widgets"],
    queryFn: async () => {
      const res = await fetch("/api/widgets");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data.items as Widget[];
    },
    initialData,
    staleTime: 30_000,
  });

  if (isLoading && !data) return <TableSkeletonRows />;
  if (isError || !data) return <p className="text-sm text-red-600">Failed to load widgets.</p>;

  const columns: DataTableColumn<Widget>[] = [
    {
      key: "name",
      label: "Name",
      render: (w) => <span className="font-medium text-gray-900">{w.name}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (w) => (
        <Badge className={cn(STATUS_TONE[w.status])}>{w.status}</Badge>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (w) => (
        <span className="text-xs text-gray-500">{formatRelativeDate(w.createdAt)}</span>
      ),
    },
  ];

  return <DataTable columns={columns} rows={data} />;
}

function TableSkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}
*/

/* ─── Patterns demonstrated ────────────────────────────────────────────────
 *  1. Server component fetches initial data (SSR-friendly).
 *  2. Auth re-check on the server even though middleware guarded the route.
 *  3. Client component takes server data as `initialData` to React Query.
 *  4. Domain status colors are HARDCODED semantic (gray/blue/green) — not
 *     themeable. Lock per app convention.
 *  5. Themeable elements (`AddButton`, action buttons) use `accent-*` classes
 *     inside @quikit/ui — automatic theming per org.
 *  6. Empty state uses `<EmptyState />` from @quikit/ui — never plain text.
 *  7. Loading state uses `<Skeleton />` — never "Loading...".
 *  8. Error path returns text but you'd use a real <Toast /> in production.
 *  9. `useQuery` keys are stable arrays. Refetch happens automatically on
 *     window focus (per the QueryClient defaults).
 * 10. `formatRelativeDate` from @quikit/ui — never write a "2 hours ago"
 *     helper yourself.
 *
 * ─── Anti-patterns this avoids ─────────────────────────────────────────────
 *  ❌ useEffect(() => fetch("/api/widgets")) — use React Query.
 *  ❌ "Loading..." text — use Skeleton.
 *  ❌ Inline styles instead of Tailwind classes.
 *  ❌ Hardcoded brand colors instead of accent-*.
 *  ❌ Re-implementing DataTable from scratch.
 *  ❌ Mixing server + client logic in one component.
 */
