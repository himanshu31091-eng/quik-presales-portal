"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Select } from "@quikit/ui";
import { useApiQuery, downloadFile, formatMoney, formatDate, type Paginated } from "@/lib/api-client";
import {
  PageHeader,
  TableShell,
  StatusPill,
  EmptyRow,
  Loading,
  ErrorNote,
} from "@/components/ui-kit";

interface EstimateRow {
  id: string;
  engagementId: string;
  title: string;
  currency: string;
  totalAmount: string;
  status: string;
  updatedAt: string;
  _count: { lines: number };
}

export default function EstimatesPage() {
  const [status, setStatus] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);

  const params = new URLSearchParams({ limit: "100" });
  if (status) params.set("status", status);

  const { data, isLoading, error } = useApiQuery<Paginated<EstimateRow>>(
    ["estimates", status],
    `/api/estimates?${params}`,
  );

  async function exportXlsx(id: string) {
    setExportError(null);
    try {
      await downloadFile(`/api/estimates/${id}/export`, {});
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Cost Estimator"
        subtitle="Line-item estimates with Excel export. Create one from an engagement."
      />

      <div className="mb-4">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "All" },
            { value: "draft", label: "Draft" },
            { value: "final", label: "Final" },
          ]}
          className="max-w-[180px]"
        />
      </div>

      {error ? <ErrorNote error={error} /> : null}
      {exportError ? <ErrorNote error={new Error(exportError)} /> : null}

      {isLoading ? (
        <Loading />
      ) : (
        <TableShell headers={["Title", "Lines", "Total", "Status", "Updated", ""]}>
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow colSpan={6} message="No estimates yet." />
          ) : (
            data?.data.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/engagements/${e.engagementId}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {e.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{e._count.lines}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  {formatMoney(e.totalAmount, e.currency)}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={e.status} />
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(e.updatedAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="secondary" onClick={() => void exportXlsx(e.id)}>
                    Excel
                  </Button>
                </td>
              </tr>
            ))
          )}
        </TableShell>
      )}
    </div>
  );
}
