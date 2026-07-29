"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Textarea } from "@quikit/ui";
import {
  api,
  useApiQuery,
  useApiMutation,
  downloadFile,
  formatDate,
} from "@/lib/api-client";
import {
  PageHeader,
  Panel,
  StatusPill,
  Loading,
  ErrorNote,
  StubBadge,
} from "@/components/ui-kit";
import type { ProposalSection } from "@/lib/proposals/sections";
import { STATUS_LABEL, type ProposalStatus } from "@/lib/proposals/status";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface ProposalDetail {
  id: string;
  title: string;
  status: string;
  approvedAt: string | null;
  engagement: { id: string; title: string };
  currentVersion: {
    id: string;
    version: number;
    sections: ProposalSection[];
    changeNote: string | null;
    source: string;
    createdAt: string;
  } | null;
  _count: { versions: number };
}

interface VersionRow {
  id: string;
  version: number;
  changeNote: string | null;
  source: string;
  createdAt: string;
}

/** Which status buttons to offer from the current state. */
const NEXT_STATUS: Record<string, { to: ProposalStatus; label: string; approve?: boolean }[]> = {
  draft: [{ to: "internal-review", label: "Send for internal review" }],
  "internal-review": [
    { to: "customer-review", label: "Send to customer" },
    { to: "approved", label: "Approve", approve: true },
    { to: "draft", label: "Back to draft" },
  ],
  "customer-review": [
    { to: "approved", label: "Approve", approve: true },
    { to: "draft", label: "Back to draft" },
  ],
  approved: [
    { to: "won", label: "Mark won" },
    { to: "lost", label: "Mark lost" },
  ],
  won: [],
  lost: [],
};

export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMyPermissions();

  const proposal = useApiQuery<ProposalDetail>(["proposal", id], `/api/proposals/${id}`);
  const versions = useApiQuery<{ versions: VersionRow[]; currentVersionId: string | null }>(
    ["proposal", id, "versions"],
    `/api/proposals/${id}/versions`,
  );

  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Re-seed the editor whenever a new version becomes current (initial load,
  // after a save, after AI generation). Keyed on the version id only —
  // depending on the whole object would re-seed on every refetch and discard
  // whatever the user is currently typing.
  const currentVersionId = proposal.data?.currentVersion?.id;
  useEffect(() => {
    const version = proposal.data?.currentVersion;
    if (version) {
      setSections(version.sections);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [currentVersionId]);

  const saveVersion = useApiMutation(
    (body: { sections: ProposalSection[]; changeNote?: string }) =>
      api.post(`/api/proposals/${id}/versions`, { ...body, source: "edit" }),
    [["proposal", id], ["proposal", id, "versions"], ["proposals"]],
  );

  const generate = useApiMutation(
    (body: { sectionSlugs?: string[] }) => api.post(`/api/proposals/${id}/generate`, body),
    [["proposal", id], ["proposal", id, "versions"]],
  );

  const transition = useApiMutation(
    (toStatus: string) => api.post(`/api/proposals/${id}/transition`, { toStatus }),
    [["proposal", id], ["proposals"], ["dashboard"]],
  );

  if (proposal.isLoading) return <Loading />;
  if (proposal.error) return <ErrorNote error={proposal.error} />;
  if (!proposal.data) return null;

  const data = proposal.data;
  const editable = can("proposals", "update") && data.status !== "won" && data.status !== "lost";
  const emptyCount = sections.filter((s) => !s.html.trim()).length;

  async function runExport(format: "pdf" | "docx") {
    setExportError(null);
    try {
      await downloadFile(`/api/proposals/${id}/export`, { format });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    }
  }

  return (
    <div>
      <PageHeader
        title={data.title}
        subtitle={
          <>
            <Link href={`/engagements/${data.engagement.id}`} className="hover:underline">
              {data.engagement.title}
            </Link>
            {data.currentVersion ? ` · v${data.currentVersion.version}` : ""}
            {data.approvedAt ? ` · approved ${formatDate(data.approvedAt)}` : ""}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={data.status} label={STATUS_LABEL[data.status as ProposalStatus]} />
            <Button variant="secondary" size="sm" onClick={() => void runExport("pdf")}>
              Export PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void runExport("docx")}>
              Export Word
            </Button>
          </div>
        }
      />

      {exportError ? <ErrorNote error={new Error(exportError)} /> : null}
      {transition.error ? <ErrorNote error={transition.error} /> : null}
      {generate.error ? <ErrorNote error={generate.error} /> : null}
      {saveVersion.error ? <ErrorNote error={saveVersion.error} /> : null}
      {generate.data && (generate.data as { isStub?: boolean }).isStub ? (
        <div className="mb-4">
          <StubBadge />
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(NEXT_STATUS[data.status] ?? []).map((action) => {
          const allowed = action.approve
            ? can("proposals", "approve")
            : can("proposals", "update");
          if (!allowed) return null;
          return (
            <Button
              key={action.to}
              size="sm"
              variant={action.approve ? "primary" : "secondary"}
              disabled={transition.isPending}
              onClick={() => transition.mutate(action.to)}
            >
              {action.label}
            </Button>
          );
        })}

        {editable ? (
          <>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            <Button
              size="sm"
              variant="secondary"
              disabled={generate.isPending || emptyCount === 0}
              onClick={() => generate.mutate({})}
              title={emptyCount === 0 ? "Every section already has content" : undefined}
            >
              {generate.isPending ? "Drafting…" : `AI draft ${emptyCount} empty section(s)`}
            </Button>
          </>
        ) : null}

        {dirty ? (
          <Button
            size="sm"
            disabled={saveVersion.isPending}
            onClick={() => saveVersion.mutate({ sections, changeNote: "Manual edit" })}
          >
            {saveVersion.isPending ? "Saving…" : "Save as new version"}
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-3">
          {sections.length === 0 ? (
            <Panel>
              <p className="py-6 text-center text-sm text-gray-400">
                This proposal has no sections.
              </p>
            </Panel>
          ) : (
            sections.map((section, index) => (
              <Panel
                key={section.slug}
                title={section.title}
                actions={
                  editable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={generate.isPending}
                      onClick={() => generate.mutate({ sectionSlugs: [section.slug] })}
                    >
                      {generate.isPending ? "…" : "AI draft"}
                    </Button>
                  ) : null
                }
              >
                <Textarea
                  rows={10}
                  className="font-mono text-xs"
                  placeholder="<p>Section content as HTML…</p>"
                  value={section.html}
                  disabled={!editable}
                  onChange={(e) => {
                    const next = [...sections];
                    next[index] = { ...section, html: e.target.value };
                    setSections(next);
                    setDirty(true);
                  }}
                />
                {section.html.trim() ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-gray-400">Preview</summary>
                    {/* Content is sanitised server-side to a safe tag subset on
                        every write; see lib/proposals/sections.ts. */}
                    <div
                      className="prose prose-sm mt-2 max-w-none text-sm text-gray-800"
                      dangerouslySetInnerHTML={{ __html: section.html }}
                    />
                  </details>
                ) : null}
              </Panel>
            ))
          )}
        </div>

        <Panel title={`Versions (${data._count.versions})`}>
          {versions.isLoading ? (
            <Loading label="…" />
          ) : (
            <ul className="space-y-2">
              {versions.data?.versions.map((v) => (
                <li
                  key={v.id}
                  className={
                    v.id === versions.data?.currentVersionId
                      ? "rounded border border-accent-200 bg-accent-50 p-2"
                      : "rounded p-2"
                  }
                >
                  <p className="text-sm font-medium text-gray-900">
                    v{v.version}
                    {v.id === versions.data?.currentVersionId ? " · current" : ""}
                  </p>
                  <p className="text-xs text-gray-500">{v.changeNote ?? v.source}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
