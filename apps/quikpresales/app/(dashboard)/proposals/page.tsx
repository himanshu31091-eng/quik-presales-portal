"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, Select } from "@quikit/ui";
import { useApiQuery, formatDate, type Paginated } from "@/lib/api-client";
import {
  PageHeader,
  TableShell,
  StatusPill,
  EmptyRow,
  Loading,
  ErrorNote,
} from "@/components/ui-kit";
import { PROPOSAL_STATUSES, STATUS_LABEL, type ProposalStatus } from "@/lib/proposals/status";

interface ProposalRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  approvedAt: string | null;
  _count: { versions: number };
}

export default function ProposalsPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams({ limit: "50" });
  if (status) params.set("status", status);
  if (search) params.set("search", search);

  const { data, isLoading, error } = useApiQuery<Paginated<ProposalRow>>(
    ["proposals", status, search],
    `/api/proposals?${params}`,
  );

  return (
    <div>
      <PageHeader
        title="Proposals"
        subtitle="Draft, review, approve and export. Create a proposal from an engagement."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "All statuses" },
            ...PROPOSAL_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABEL[s as ProposalStatus],
            })),
          ]}
          className="max-w-[200px]"
        />
      </div>

      {error ? <ErrorNote error={error} /> : null}

      {isLoading ? (
        <Loading />
      ) : (
        <TableShell headers={["Title", "Status", "Versions", "Approved", "Updated"]}>
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow colSpan={5} message="No proposals match these filters." />
          ) : (
            data?.data.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/proposals/${p.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {p.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={p.status} label={STATUS_LABEL[p.status as ProposalStatus]} />
                </td>
                <td className="px-4 py-2.5 text-gray-600">{p._count.versions}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(p.approvedAt)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(p.updatedAt)}</td>
              </tr>
            ))
          )}
        </TableShell>
      )}
    </div>
  );
}
