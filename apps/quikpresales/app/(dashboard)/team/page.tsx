"use client";

import Link from "next/link";
import { useApiQuery, formatMoney } from "@/lib/api-client";
import { PageHeader, Panel, Loading, ErrorNote, StatusPill } from "@/components/ui-kit";

interface PersonStats {
  id: string;
  name: string;
  active: number;
  stuck: number;
  won: number;
  lost: number;
  rejected: number;
}

interface StuckDeal {
  id: string;
  title: string;
  stage: string;
  stageLabel: string;
  idleDays: number;
  ownerId: string | null;
  ownerName: string | null;
  estRevenue: string | null;
  currency: string | null;
}

interface Activity {
  id: string;
  type: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
  engagement: { id: string; title: string };
}

interface TeamData {
  stuckThresholdDays: number;
  people: PersonStats[];
  stuckDeals: StuckDeal[];
  recentActivity: Activity[];
}

export default function TeamPage() {
  const { data, isLoading, error } = useApiQuery<TeamData>(["team"], "/api/team");

  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Team Overview"
        subtitle="Who's working on what, how much progress each person is making, and what's stuck"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel title="By Person">
            {data.people.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                No engagements are assigned to anyone yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-500">
                      <th className="pb-2">Person</th>
                      <th className="pb-2 text-right">Active</th>
                      <th className="pb-2 text-right">Stuck</th>
                      <th className="pb-2 text-right">Won</th>
                      <th className="pb-2 text-right">Lost</th>
                      <th className="pb-2 text-right">Rejected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.people.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 font-medium text-gray-900">{p.name}</td>
                        <td className="py-2 text-right text-gray-700">{p.active}</td>
                        <td className="py-2 text-right">
                          {p.stuck > 0 ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              {p.stuck}
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="py-2 text-right text-green-700">{p.won}</td>
                        <td className="py-2 text-right text-red-700">{p.lost}</td>
                        <td className="py-2 text-right text-gray-500">{p.rejected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title={`Stuck Deals (no update in over ${data.stuckThresholdDays} days)`}>
            {data.stuckDeals.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                Nothing is stuck — every open deal has had activity recently.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.stuckDeals.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/engagements/${d.id}`}
                        className="truncate text-sm font-medium text-gray-900 hover:underline"
                      >
                        {d.title}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                        {d.ownerName ?? "Unassigned"}
                        <StatusPill status={d.stage} label={d.stageLabel} />
                        {formatMoney(d.estRevenue, d.currency ?? undefined)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {d.idleDays}d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Recent Activity">
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-gray-400">Nothing has happened yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="py-2">
                    <p className="text-sm text-gray-900">
                      {a.actorName ? <span className="font-medium">{a.actorName}</span> : null}
                      {a.actorName ? " — " : ""}
                      {a.summary}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      <Link href={`/engagements/${a.engagement.id}`} className="hover:underline">
                        {a.engagement.title}
                      </Link>{" "}
                      · {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
