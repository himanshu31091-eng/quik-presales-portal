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

interface RfpRow {
  id: string;
  engagementId: string;
  title: string;
  status: string;
  dueDate: string | null;
  extractError: string | null;
  updatedAt: string;
  _count: { requirements: number };
}

export default function RfpsPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams({ limit: "50" });
  if (status) params.set("status", status);
  if (search) params.set("search", search);

  const { data, isLoading, error } = useApiQuery<Paginated<RfpRow>>(
    ["rfps", status, search],
    `/api/rfps?${params}`,
  );

  return (
    <div>
      <PageHeader
        title="RFP Manager"
        subtitle="Upload an RFP against an engagement, then extract its requirements into a compliance matrix"
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
            { value: "uploaded", label: "Uploaded" },
            { value: "extracting", label: "Extracting" },
            { value: "extracted", label: "Extracted" },
            { value: "responded", label: "Responded" },
            { value: "submitted", label: "Submitted" },
          ]}
          className="max-w-[180px]"
        />
      </div>

      {error ? <ErrorNote error={error} /> : null}

      <p className="mb-4 text-sm text-gray-500">
        New RFPs start from an engagement — open one, upload the document under{" "}
        <strong>Documents</strong>, then add it as an RFP.
      </p>

      {isLoading ? (
        <Loading />
      ) : (
        <TableShell headers={["Title", "Status", "Requirements", "Due", "Updated"]}>
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow colSpan={5} message="No RFPs match these filters." />
          ) : (
            data?.data.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/rfps/${r.id}`} className="font-medium text-gray-900 hover:underline">
                    {r.title}
                  </Link>
                  {r.extractError ? (
                    <p className="mt-0.5 text-xs text-red-600">{r.extractError}</p>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={r.status} />
                </td>
                <td className="px-4 py-2.5 text-gray-600">{r._count.requirements}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(r.dueDate)}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(r.updatedAt)}</td>
              </tr>
            ))
          )}
        </TableShell>
      )}
    </div>
  );
}
