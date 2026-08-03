"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Select, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
import {
  api,
  useApiQuery,
  useApiMutation,

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
  ComboField,
} from "@/components/ui-kit";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { useVocabulary, VOCABULARY_KEY } from "@/lib/hooks/useVocabulary";
import { useDisplayCurrency } from "@/lib/hooks/useCurrency";
import { toMinorUnits } from "@/lib/currency/currencies";

interface EngagementRow {
  id: string;
  title: string;
  industry: string | null;
  stage: string;
  closedStatus: string;
  estRevenue: string | null;
  currency: string | null;
  probability: number;
  expectedClose: string | null;
  aiDealHealth: string | null;
  updatedAt: string;
}

export default function EngagementsPage() {
  const { can } = useMyPermissions();
  // Values are stored in the currency each deal was sold in and converted for
  // display only, so the list reads in one currency without rewriting any record.
  const { formatConverted, displayCurrency, setDisplayCurrency, currencies } = useDisplayCurrency();
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
        <Select
          value={displayCurrency}
          onChange={(e) => setDisplayCurrency(e.target.value)}
          options={currencies.map((c) => ({ value: c.code, label: `View in ${c.code}` }))}
          className="max-w-[160px]"
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
                <td className="px-4 py-2.5 text-gray-900">{formatConverted(e.estRevenue, e.currency)}</td>
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
  const { industries } = useVocabulary();
  const { currencies, displayCurrency } = useDisplayCurrency();
  // Default the new record to whatever the user is currently viewing in — most
  // people enter deals in the currency they are already thinking in.
  const [currency, setCurrency] = useState(displayCurrency);

  const create = useApiMutation(
    (body: Record<string, unknown>) => api.post("/api/engagements", body),
    // VOCABULARY_KEY: saving may introduce a term nobody has used before, and it
    // should be suggested in the next form without a reload.
    [["engagements"], ["dashboard"], VOCABULARY_KEY],
  );

  function submit() {
    create.mutate(
      {
        title,
        ...(industry ? { industry } : {}),
        // The column stores minor units, and the exponent is per-currency — 2 for
        // INR, 0 for JPY. Hardcoding x100 misstored every zero-decimal currency
        // by 100x.
        ...(revenue ? { estRevenue: toMinorUnits(Number(revenue), currency).toString() } : {}),
        currency,
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
          <ComboField
            label="Industry"
            value={industry}
            onChange={setIndustry}
            options={industries}
            placeholder="e.g. Manufacturing — or type your own"
          />
          <div className="grid grid-cols-[1fr_130px] gap-3">
            <Input
              label="Estimated revenue"
              type="number"
              min={0}
              step="any"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              placeholder="0"
            />
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              options={currencies.map((c) => ({ value: c.code, label: c.code }))}
            />
          </div>
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
