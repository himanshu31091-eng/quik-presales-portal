"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Select, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
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
  TableShell,
  StatusPill,
  EmptyRow,
  Loading,
  ErrorNote,
} from "@/components/ui-kit";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { INDUSTRIES } from "@/lib/library/constants";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface EngagementRow {
  id: string;
  title: string;
  industry: string | null;
  stage: string;
  closedStatus: string;
  estRevenue: string | null;
  probability: number;
  expectedClose: string | null;
  aiDealHealth: string | null;
  updatedAt: string;
}

export default function EngagementsPage() {
  const { can } = useMyPermissions();
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams({ limit: "50" });
  if (stage) params.set("stage", stage);
  if (search) params.set("search", search);

  const { data, isLoading, error } = useApiQuery<Paginated<EngagementRow>>(
    ["engagements", stage, search],
    `/api/engagements?${params}`,
  );

  return (
    <div>
      <PageHeader
        title="Engagements"
        subtitle="Every opportunity pre-sales is supporting"
        actions={
          can("engagements", "create") ? (
            <Button onClick={() => setCreating(true)}>New Engagement</Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          options={[
            { value: "", label: "All stages" },
            ...ACTIVE_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s as Stage] })),
            { value: "won", label: "Won" },
            { value: "lost", label: "Lost" },
          ]}
          className="max-w-[180px]"
        />
      </div>

      {error ? <ErrorNote error={error} /> : null}
      {isLoading ? (
        <Loading />
      ) : (
        <TableShell
          headers={["Title", "Industry", "Stage", "Value", "Prob.", "Close", "Health", "Updated"]}
        >
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow colSpan={8} message="No engagements match these filters." />
          ) : (
            data?.data.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/engagements/${e.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {e.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{e.industry ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <StatusPill
                    status={e.closedStatus === "open" ? e.stage : e.closedStatus}
                    label={STAGE_LABEL[e.stage as Stage] ?? e.stage}
                  />
                </td>
                <td className="px-4 py-2.5 text-gray-900">{formatMoney(e.estRevenue)}</td>
                <td className="px-4 py-2.5 text-gray-600">{e.probability}%</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(e.expectedClose)}</td>
                <td className="px-4 py-2.5">
                  {e.aiDealHealth ? <StatusPill status={e.aiDealHealth} /> : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(e.updatedAt)}</td>
              </tr>
            ))
          )}
        </TableShell>
      )}

      {creating ? <CreateEngagementModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CreateEngagementModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [revenue, setRevenue] = useState("");
  const [crmOpportunityId, setCrmOpportunityId] = useState("");

  const create = useApiMutation(
    (body: Record<string, unknown>) => api.post("/api/engagements", body),
    [["engagements"], ["dashboard"]],
  );

  function submit() {
    create.mutate(
      {
        title,
        ...(industry ? { industry } : {}),
        // The API takes paise; the form takes rupees.
        ...(revenue ? { estRevenue: String(Math.round(Number(revenue) * 100)) } : {}),
        ...(crmOpportunityId ? { crmOpportunityId } : {}),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>New Engagement</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Input
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Acme Corp — D365 migration"
          />
          <Select
            label="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            options={[
              { value: "", label: "Not set" },
              ...INDUSTRIES.map((i) => ({ value: i, label: i })),
            ]}
          />
          <Input
            label="Estimated revenue (₹)"
            type="number"
            min={0}
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
          />
          <Input
            label="CRM opportunity ID"
            value={crmOpportunityId}
            onChange={(e) => setCrmOpportunityId(e.target.value)}
            placeholder="Paste from QuikCRM (optional)"
          />
          {create.error ? <ErrorNote error={create.error} /> : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={title.trim().length < 2 || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
