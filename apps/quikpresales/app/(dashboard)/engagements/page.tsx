"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Select, Checkbox, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
import {
  api,
  useApiQuery,
  useApiMutation,
  downloadFile,
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
  idleDays: number;
  salesOwnerName: string | null;
  presalesOwnerName: string | null;
  updatedAt: string;
}

/** Open this long in one stage without moving and it's flagged as stuck. */
const STUCK_THRESHOLD_DAYS = 14;

export default function EngagementsPage() {
  const { can } = useMyPermissions();
  // Values are stored in the currency each deal was sold in and converted for
  // display only, so the list reads in one currency without rewriting any record.
  const { formatConverted, displayCurrency, setDisplayCurrency, currencies } = useDisplayCurrency();
  const { industries } = useVocabulary();
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [closeFrom, setCloseFrom] = useState("");
  const [closeTo, setCloseTo] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const params = new URLSearchParams({ limit: "50" });
  if (stage) params.set("stage", stage);
  if (search) params.set("search", search);
  if (industry) params.set("industry", industry);
  if (closeFrom) params.set("closeFrom", new Date(closeFrom).toISOString());
  if (closeTo) params.set("closeTo", new Date(closeTo).toISOString());
  if (mineOnly) params.set("mine", "true");

  const { data, isLoading, error } = useApiQuery<Paginated<EngagementRow>>(
    ["engagements", stage, search, industry, closeFrom, closeTo, mineOnly],
    `/api/engagements?${params}`,
  );

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile("/api/engagements/export", {
        ...(stage ? { stage } : {}),
        ...(search ? { search } : {}),
        ...(industry ? { industry } : {}),
        ...(closeFrom ? { closeFrom: new Date(closeFrom).toISOString() } : {}),
        ...(closeTo ? { closeTo: new Date(closeTo).toISOString() } : {}),
        ...(mineOnly ? { mine: true } : {}),
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Engagements"
        subtitle="Every opportunity pre-sales is supporting"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Export"}
            </Button>
            {can("engagements", "create") ? (
              <Button onClick={() => setCreating(true)}>New Engagement</Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          options={[{ value: "", label: "All industries" }, ...industries.map((i) => ({ value: i, label: i }))]}
          className="max-w-[180px]"
        />
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span>Close</span>
          <Input type="date" value={closeFrom} onChange={(e) => setCloseFrom(e.target.value)} className="w-[150px]" />
          <span>–</span>
          <Input type="date" value={closeTo} onChange={(e) => setCloseTo(e.target.value)} className="w-[150px]" />
        </div>
        <Select
          value={displayCurrency}
          onChange={(e) => setDisplayCurrency(e.target.value)}
          options={currencies.map((c) => ({ value: c.code, label: `View in ${c.code}` }))}
          className="max-w-[160px]"
        />
        <div className="flex items-center">
          <Checkbox
            label="My items only"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
          />
        </div>
      </div>

      {error ? <ErrorNote error={error} /> : null}
      {isLoading ? (
        <Loading />
      ) : (
        <TableShell
          headers={["Title", "Owner", "Industry", "Stage", "Value", "Prob.", "Close", "Health", "Updated"]}
        >
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow
              colSpan={9}
              message={mineOnly ? "No engagements assigned to you match these filters." : "No engagements match these filters."}
            />
          ) : (
            data?.data.map((e) => {
              const stuck = e.closedStatus === "open" && e.idleDays > STUCK_THRESHOLD_DAYS;
              return (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/engagements/${e.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {e.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {e.presalesOwnerName ?? e.salesOwnerName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{e.industry ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <StatusPill
                        status={e.closedStatus === "open" ? e.stage : e.closedStatus}
                        label={STAGE_LABEL[e.stage as Stage] ?? e.stage}
                      />
                      {stuck ? (
                        <span
                          title={`No update in ${e.idleDays} days`}
                          className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                        >
                          Stuck {e.idleDays}d
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-900">{formatConverted(e.estRevenue, e.currency)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{e.probability}%</td>
                  <td className="px-4 py-2.5 text-gray-600">{formatDate(e.expectedClose)}</td>
                  <td className="px-4 py-2.5">
                    {e.aiDealHealth ? <StatusPill status={e.aiDealHealth} /> : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(e.updatedAt)}</td>
                </tr>
              );
            })
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
