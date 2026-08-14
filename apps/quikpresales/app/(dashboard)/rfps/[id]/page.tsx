"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Select, Textarea } from "@quikit/ui";
import { api, useApiQuery, useApiMutation, formatDate } from "@/lib/api-client";
import { PageHeader, Panel, StatusPill, Loading, ErrorNote } from "@/components/ui-kit";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface RfpDetail {
  id: string;
  engagementId: string;
  sourceDocId: string | null;
  title: string;
  status: string;
  extractError: string | null;
  dueDate: string | null;
  submittedAt: string | null;
  engagement: { id: string; title: string };
  _count: { requirements: number };
  answeredCount: number;
}

interface Requirement {
  id: string;
  text: string;
  category: string | null;
  citation: { page: number | null; quotedText: string } | null;
  complianceStatus: string;
  responseText: string | null;
  aiGenerated: boolean;
  sortOrder: number;
}

interface MatrixResponse {
  requirements: Requirement[];
  summary: Record<string, number>;
  total: number;
}

const STATUSES = ["compliant", "partial", "gap", "clarify"] as const;

export default function RfpDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMyPermissions();

  const rfp = useApiQuery<RfpDetail>(["rfp", id], `/api/rfps/${id}`);
  const matrix = useApiQuery<MatrixResponse>(["rfp", id, "requirements"], `/api/rfps/${id}/requirements`);

  // Extraction runs server-side and can take minutes. Poll while it's in
  // flight so the matrix appears as soon as the job lands.
  useEffect(() => {
    if (rfp.data?.status !== "extracting") return;
    const timer = setInterval(() => {
      void rfp.refetch();
      void matrix.refetch();
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch identities are stable enough here
  }, [rfp.data?.status]);

  const extract = useApiMutation(
    () => api.post(`/api/rfps/${id}/extract`),
    [["rfp", id], ["rfps"]],
  );

  if (rfp.isLoading) return <Loading />;
  if (rfp.error) return <ErrorNote error={rfp.error} />;
  if (!rfp.data) return null;

  const data = rfp.data;
  const extracting = data.status === "extracting";

  return (
    <div>
      <PageHeader
        title={data.title}
        subtitle={
          <>
            <Link href={`/engagements/${data.engagement.id}`} className="hover:underline">
              {data.engagement.title}
            </Link>
            {data.dueDate ? ` · due ${formatDate(data.dueDate)}` : ""}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={data.status} />
            {can("rfp", "update") ? (
              <Button
                onClick={() => extract.mutate(undefined)}
                disabled={extracting || extract.isPending || !data.sourceDocId}
                title={data.sourceDocId ? undefined : "Attach a source document first"}
              >
                {extracting || extract.isPending
                  ? "Extracting…"
                  : data._count.requirements > 0
                    ? "Re-extract"
                    : "Extract requirements"}
              </Button>
            ) : null}
          </div>
        }
      />

      {extract.error ? <ErrorNote error={extract.error} /> : null}
      {data.extractError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Last extraction failed: {data.extractError}
        </div>
      ) : null}
      {extracting ? (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Extraction is running. This page refreshes automatically.
        </div>
      ) : null}

      {matrix.data ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">
            {data.answeredCount} of {matrix.data.total} answered
          </span>
          {STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <StatusPill status={s} />
              <span className="text-sm text-gray-500">{matrix.data?.summary[s] ?? 0}</span>
            </span>
          ))}
        </div>
      ) : null}

      {matrix.isLoading ? (
        <Loading label="Loading compliance matrix…" />
      ) : (matrix.data?.requirements.length ?? 0) === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-gray-400">
            No requirements yet.{" "}
            {data.sourceDocId
              ? "Run extraction to build the compliance matrix."
              : "Attach a source document to this RFP first."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {matrix.data?.requirements.map((r, i) => (
            <RequirementCard
              key={r.id}
              index={i + 1}
              rfpId={id}
              requirement={r}
              editable={can("rfp", "update")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequirementCard({
  index,
  rfpId,
  requirement,
  editable,
}: {
  index: number;
  rfpId: string;
  requirement: Requirement;
  editable: boolean;
}) {
  const [response, setResponse] = useState(requirement.responseText ?? "");
  const [status, setStatus] = useState(requirement.complianceStatus);
  const [dirty, setDirty] = useState(false);

  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      api.patch(`/api/rfps/${rfpId}/requirements/${requirement.id}`, body),
    [["rfp", rfpId], ["rfp", rfpId, "requirements"]],
  );

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-900">
            <span className="mr-2 font-mono text-xs text-gray-400">#{index}</span>
            {requirement.text}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            {requirement.category ? <span>{requirement.category}</span> : null}
            {requirement.aiGenerated ? <span>· AI extracted</span> : <span>· added manually</span>}
            {requirement.citation ? (
              <span
                className="cursor-help border-b border-dotted border-gray-300"
                title={requirement.citation.quotedText}
              >
                ·{" "}
                {requirement.citation.page !== null
                  ? `source p.${requirement.citation.page}`
                  : "source quoted"}
              </span>
            ) : null}
          </div>
        </div>

        {editable ? (
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setDirty(true);
            }}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            className="w-36 shrink-0"
          />
        ) : (
          <StatusPill status={requirement.complianceStatus} />
        )}
      </div>

      <div className="mt-3">
        <Textarea
          rows={3}
          placeholder="Our response to this requirement…"
          value={response}
          disabled={!editable}
          onChange={(e) => {
            setResponse(e.target.value);
            setDirty(true);
          }}
        />
      </div>

      {editable && dirty ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          {save.error ? (
            <span className="text-xs text-red-600">{(save.error as Error).message}</span>
          ) : null}
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { responseText: response.trim() || null, complianceStatus: status },
                { onSuccess: () => setDirty(false) },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
