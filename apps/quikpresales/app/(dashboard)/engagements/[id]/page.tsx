"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Select, Tabs } from "@quikit/ui";
import {
  api,
  useApiQuery,
  useApiMutation,
  formatMoney,
  formatDate,
  type Paginated,
} from "@/lib/api-client";
import {
  PageHeader,
  Panel,
  StatusPill,
  Loading,
  ErrorNote,
  TableShell,
  EmptyRow,
} from "@/components/ui-kit";
import { ACTIVE_STAGES, STAGE_LABEL, STAGE_ORDER, type Stage } from "@/lib/pipeline";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface EngagementDetail {
  id: string;
  title: string;
  industry: string | null;
  territory: string | null;
  stage: string;
  closedStatus: string;
  estRevenue: string | null;
  currency: string | null;
  probability: number;
  competitors: string[];
  techStack: string[];
  expectedClose: string | null;
  aiDealHealth: string | null;
  riskScore: number | null;
  dealHealthUpdatedAt: string | null;
  crmOpportunityId: string | null;
  _count: {
    documents: number;
    rfps: number;
    proposals: number;
    estimates: number;
    timelineEvents: number;
  };
}

interface TimelineEvent {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
}

export default function EngagementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMyPermissions();
  const [tab, setTab] = useState("overview");

  const { data, isLoading, error } = useApiQuery<EngagementDetail>(
    ["engagement", id],
    `/api/engagements/${id}`,
  );

  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const closed = data.closedStatus !== "open";

  return (
    <div>
      <PageHeader
        title={data.title}
        subtitle={[data.industry, data.territory].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill
              status={closed ? data.closedStatus : data.stage}
              label={STAGE_LABEL[data.stage as Stage] ?? data.stage}
            />
            {!closed && can("engagements", "update") ? (
              <>
                <DealHealthAssessor engagementId={id} assessed={!!data.aiDealHealth} />
                <StageAdvancer engagementId={id} currentStage={data.stage} />
              </>
            ) : null}
          </div>
        }
      />

      <Tabs
        items={[
          { key: "overview", label: "Overview" },
          { key: "timeline", label: `Timeline (${data._count.timelineEvents})` },
          { key: "documents", label: `Documents (${data._count.documents})` },
          { key: "rfps", label: `RFPs (${data._count.rfps})` },
          { key: "proposals", label: `Proposals (${data._count.proposals})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-5">
        {tab === "overview" ? <Overview engagement={data} /> : null}
        {tab === "timeline" ? <Timeline engagementId={id} /> : null}
        {tab === "documents" ? <Documents engagementId={id} /> : null}
        {tab === "rfps" ? <RelatedRfps engagementId={id} /> : null}
        {tab === "proposals" ? <RelatedProposals engagementId={id} /> : null}
      </div>
    </div>
  );
}

function Overview({ engagement }: { engagement: EngagementDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Estimated value", formatMoney(engagement.estRevenue, engagement.currency ?? "INR")],
    ["Probability", `${engagement.probability}%`],
    ["Expected close", formatDate(engagement.expectedClose)],
    ["Competitors", engagement.competitors.join(", ") || "—"],
    ["Technology", engagement.techStack.join(", ") || "—"],
    [
      "CRM opportunity",
      engagement.crmOpportunityId ? (
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
          {engagement.crmOpportunityId}
        </code>
      ) : (
        "— not linked"
      ),
    ],
    [
      "AI deal health",
      engagement.aiDealHealth ? (
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill status={engagement.aiDealHealth} />
          {engagement.riskScore !== null ? (
            <span className="text-xs text-[var(--color-text-secondary)]">
              risk {engagement.riskScore}/100
            </span>
          ) : null}
          {engagement.dealHealthUpdatedAt ? (
            <span className="text-xs text-[var(--color-text-secondary)]">
              assessed {formatDate(engagement.dealHealthUpdatedAt)}
            </span>
          ) : null}
        </span>
      ) : (
        "Not scored"
      ),
    ],
  ];

  return (
    <Panel>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-gray-50 pb-2">
            <dt className="text-sm text-gray-500">{label}</dt>
            <dd className="text-right text-sm font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

interface DealHealthResult {
  health: string;
  riskScore: number;
  rationale: string;
  risks: string[];
  nextActions: string[];
  isStub: boolean;
}

/**
 * Triggers `POST /api/engagements/[id]/deal-health`.
 *
 * The persisted verdict lands on the Overview tab via query invalidation; the
 * narrative (rationale, risks, next actions) has no column on the engagement, so
 * it is only shown here from the mutation's own response and on the timeline.
 * Rendered only for open engagements with `engagements:update`, matching the
 * server's guards — the endpoint 409s on a closed deal.
 */
function DealHealthAssessor({ engagementId, assessed }: { engagementId: string; assessed: boolean }) {
  const assess = useApiMutation<DealHealthResult, void>(
    () => api.post(`/api/engagements/${engagementId}/deal-health`, {}),
    [["engagement", engagementId], ["engagements"], ["dashboard"]],
  );

  const result = assess.data;

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="secondary"
        disabled={assess.isPending}
        onClick={() => assess.mutate()}
      >
        {assess.isPending ? "Assessing…" : assessed ? "Re-assess health" : "Assess deal health"}
      </Button>

      {assess.error ? (
        <span className="ml-2 text-xs text-red-600">{(assess.error as Error).message}</span>
      ) : null}

      {result ? (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 shadow-lg">
          <div className="mb-2 flex items-center gap-2">
            <StatusPill status={result.health} />
            <span className="text-xs text-[var(--color-text-secondary)]">
              risk {result.riskScore}/100
            </span>
          </div>

          {result.isStub ? (
            <p className="text-xs text-amber-700">
              AI is not configured in this environment, so this is a placeholder rather than a real
              assessment.
            </p>
          ) : (
            <p className="text-xs text-[var(--color-text-secondary)]">{result.rationale}</p>
          )}

          {result.risks.length > 0 ? (
            <>
              <p className="mt-2 text-xs font-medium">Risks</p>
              <ul className="ml-4 list-disc text-xs text-[var(--color-text-secondary)]">
                {result.risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </>
          ) : null}

          {result.nextActions.length > 0 ? (
            <>
              <p className="mt-2 text-xs font-medium">Suggested next actions</p>
              <ul className="ml-4 list-disc text-xs text-[var(--color-text-secondary)]">
                {result.nextActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StageAdvancer({ engagementId, currentStage }: { engagementId: string; currentStage: string }) {
  const [target, setTarget] = useState("");

  const transition = useApiMutation(
    (toStage: string) => api.post(`/api/engagements/${engagementId}/transition`, { toStage }),
    [["engagement", engagementId], ["engagements"], ["dashboard"]],
  );

  // Only forward stages plus the two terminal outcomes are valid targets — the
  // server enforces this too, but offering impossible options is bad UI.
  const currentIndex = STAGE_ORDER.indexOf(currentStage as Stage);
  const options = [
    { value: "", label: "Move to…" },
    ...ACTIVE_STAGES.filter((s) => STAGE_ORDER.indexOf(s) > currentIndex).map((s) => ({
      value: s,
      label: STAGE_LABEL[s as Stage],
    })),
    { value: "won", label: "Mark Won" },
    { value: "lost", label: "Mark Lost" },
  ];

  return (
    <div className="flex items-center gap-2">
      <Select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        options={options}
        className="min-w-[160px]"
      />
      <Button
        size="sm"
        disabled={!target || transition.isPending}
        onClick={() => transition.mutate(target, { onSuccess: () => setTarget("") })}
      >
        {transition.isPending ? "Moving…" : "Apply"}
      </Button>
      {transition.error ? (
        <span className="text-xs text-red-600">{(transition.error as Error).message}</span>
      ) : null}
    </div>
  );
}

function Timeline({ engagementId }: { engagementId: string }) {
  const { data, isLoading } = useApiQuery<Paginated<TimelineEvent>>(
    ["engagement", engagementId, "timeline"],
    `/api/engagements/${engagementId}/timeline?limit=100`,
  );

  if (isLoading) return <Loading />;

  return (
    <Panel>
      {(data?.data.length ?? 0) === 0 ? (
        <p className="text-sm text-gray-400">No activity recorded yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-gray-200 pl-5">
          {data?.data.map((e) => (
            <li key={e.id}>
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent-400" />
              <p className="text-sm text-gray-900">{e.summary}</p>
              <p className="text-xs text-gray-400">
                {e.type} · {new Date(e.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

interface DocumentRow {
  id: string;
  category: string;
  filename: string;
  sizeBytes: number;
  blobUrl: string;
  status: string;
  createdAt: string;
}

function Documents({ engagementId }: { engagementId: string }) {
  const { can } = useMyPermissions();
  const { data, isLoading, refetch } = useApiQuery<DocumentRow[]>(
    ["engagement", engagementId, "documents"],
    `/api/engagements/${engagementId}/documents`,
  );

  return (
    <div className="space-y-4">
      {can("engagements", "update") ? (
        <UploadBox engagementId={engagementId} onUploaded={() => void refetch()} />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : (
        <TableShell headers={["File", "Category", "Size", "Status", "Uploaded"]}>
          {(data?.length ?? 0) === 0 ? (
            <EmptyRow colSpan={5} message="No documents uploaded yet." />
          ) : (
            data?.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <a
                    href={d.blobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-900 hover:underline"
                  >
                    {d.filename}
                  </a>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{d.category}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  {(d.sizeBytes / 1024).toFixed(0)} KB
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill status={d.status} />
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(d.createdAt)}</td>
              </tr>
            ))
          )}
        </TableShell>
      )}
    </div>
  );
}

function UploadBox({
  engagementId,
  onUploaded,
}: {
  engagementId: string;
  onUploaded: () => void;
}) {
  const [category, setCategory] = useState("rfp");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("engagementId", engagementId);
      form.append("category", category);

      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Upload failed");
      onUploaded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[
            { value: "rfp", label: "RFP" },
            { value: "proposal", label: "Proposal" },
            { value: "sow", label: "SOW" },
            { value: "architecture", label: "Architecture" },
            { value: "demo-script", label: "Demo script" },
            { value: "reference", label: "Reference" },
            { value: "other", label: "Other" },
          ]}
          className="max-w-[180px]"
        />
        <label className="cursor-pointer rounded-md bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-700">
          {busy ? "Uploading…" : "Choose file"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-xs text-gray-400">PDF, DOCX, XLSX, images. Max 4.5 MB.</p>
      </div>
      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
    </Panel>
  );
}

function RelatedRfps({ engagementId }: { engagementId: string }) {
  const { data, isLoading } = useApiQuery<
    Paginated<{ id: string; title: string; status: string; dueDate: string | null; _count: { requirements: number } }>
  >(["engagement", engagementId, "rfps"], `/api/rfps?engagementId=${engagementId}`);

  if (isLoading) return <Loading />;

  return (
    <TableShell headers={["Title", "Status", "Requirements", "Due"]}>
      {(data?.data.length ?? 0) === 0 ? (
        <EmptyRow colSpan={4} message="No RFPs linked to this engagement." />
      ) : (
        data?.data.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <td className="px-4 py-2.5">
              <Link href={`/rfps/${r.id}`} className="text-gray-900 hover:underline">
                {r.title}
              </Link>
            </td>
            <td className="px-4 py-2.5">
              <StatusPill status={r.status} />
            </td>
            <td className="px-4 py-2.5 text-gray-600">{r._count.requirements}</td>
            <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(r.dueDate)}</td>
          </tr>
        ))
      )}
    </TableShell>
  );
}

function RelatedProposals({ engagementId }: { engagementId: string }) {
  const { data, isLoading } = useApiQuery<
    Paginated<{ id: string; title: string; status: string; updatedAt: string; _count: { versions: number } }>
  >(["engagement", engagementId, "proposals"], `/api/proposals?engagementId=${engagementId}`);

  if (isLoading) return <Loading />;

  return (
    <TableShell headers={["Title", "Status", "Versions", "Updated"]}>
      {(data?.data.length ?? 0) === 0 ? (
        <EmptyRow colSpan={4} message="No proposals for this engagement." />
      ) : (
        data?.data.map((p) => (
          <tr key={p.id} className="hover:bg-gray-50">
            <td className="px-4 py-2.5">
              <Link href={`/proposals/${p.id}`} className="text-gray-900 hover:underline">
                {p.title}
              </Link>
            </td>
            <td className="px-4 py-2.5">
              <StatusPill status={p.status} />
            </td>
            <td className="px-4 py-2.5 text-gray-600">{p._count.versions}</td>
            <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(p.updatedAt)}</td>
          </tr>
        ))
      )}
    </TableShell>
  );
}
