"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input, Select, Checkbox, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter, Textarea } from "@quikit/ui";
import { api, useApiMutation, useApiQuery, downloadFile, formatDate, formatMoney, type Paginated } from "@/lib/api-client";
import {
  PageHeader,
  TableShell,
  StatusPill,
  EmptyRow,
  Loading,
  ErrorNote,
  ComboField,
} from "@/components/ui-kit";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { useVocabulary, VOCABULARY_KEY } from "@/lib/hooks/useVocabulary";
import { useDisplayCurrency } from "@/lib/hooks/useCurrency";
import { toMinorUnits } from "@/lib/currency/currencies";

interface LeadRow {
  id: string;
  title: string;
  industry: string | null;
  territory: string | null;
  salesOwnerId: string | null;
  salesOwnerName: string | null;
  estRevenue: string | null;
  currency: string | null;
  createdAt: string;
  rfpId: string | null;
  blockerCount: number;
  blockersAnswered: number;
  readyForReview: boolean;
}

function ReadinessPill({ lead }: { lead: LeadRow }) {
  if (lead.blockerCount === 0) {
    return <StatusPill status="compliant" label="No blockers" />;
  }
  if (lead.readyForReview) {
    return <StatusPill status="compliant" label="Ready for review" />;
  }
  const open = lead.blockerCount - lead.blockersAnswered;
  return <StatusPill status="gap" label={`${open} blocker${open === 1 ? "" : "s"} open`} />;
}

const LEAD_CSV_TEMPLATE =
  "title,requirement,industry,territory,budgetHint,timelineHint,techStack,crmOpportunityId,estRevenue,currency\n" +
  '"Acme Corp — ERP rollout","Customer wants to replace their legacy ERP across 3 plants.","Manufacturing","APAC","~$200k","Q2 2027","Dynamics365;AzureAI","CRM-1234","20000000","INR"\n';

function downloadLeadCsvTemplate() {
  const blob = new Blob([LEAD_CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "leads-import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function LeadsPage() {
  const { can } = useMyPermissions();
  const { industries } = useVocabulary();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [industry, setIndustry] = useState("");
  const [exporting, setExporting] = useState(false);

  const params = new URLSearchParams({ limit: "50" });
  if (mineOnly) params.set("mine", "true");
  if (industry) params.set("industry", industry);

  const { data, isLoading, error } = useApiQuery<Paginated<LeadRow>>(
    ["leads", mineOnly, industry],
    `/api/leads?${params}`,
  );

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile("/api/leads/export", {
        ...(mineOnly ? { mine: true } : {}),
        ...(industry ? { industry } : {}),
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="New opportunities awaiting a pre-sales decision"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting…" : "Export"}
            </Button>
            {can("engagements", "create") ? (
              <>
                <Button variant="secondary" onClick={() => setImporting(true)}>
                  Bulk Import
                </Button>
                <Button onClick={() => setCreating(true)}>New Lead</Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          options={[{ value: "", label: "All industries" }, ...industries.map((i) => ({ value: i, label: i }))]}
          className="max-w-[180px]"
        />
        <Checkbox
          label="My submissions only"
          checked={mineOnly}
          onChange={(e) => setMineOnly(e.target.checked)}
        />
      </div>

      {error ? <ErrorNote error={error} /> : null}
      {isLoading ? (
        <Loading />
      ) : (
        <TableShell headers={["Title", "Submitted by", "Industry", "Value", "Readiness", "Submitted", ""]}>
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow
              colSpan={7}
              message={mineOnly ? "You haven't submitted any leads waiting on a decision." : "No leads waiting on a decision."}
            />
          ) : (
            data?.data.map((lead) => <LeadRowView key={lead.id} lead={lead} />)
          )}
        </TableShell>
      )}

      {creating ? <NewLeadModal onClose={() => setCreating(false)} /> : null}
      {importing ? <BulkImportModal onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

interface BulkImportResult {
  totalRows: number;
  created: number;
  errors: { row: number; title: string; message: string }[];
}

function BulkImportModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const qc = useQueryClient();

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/leads/bulk", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; data?: BulkImportResult; error?: string }
        | null;
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error ?? `Import failed (${res.status})`);
      }
      setResult(json.data);
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Bulk Import Leads</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-600">
                Upload a CSV of leads. These skip AI requirement screening and land directly in
                the queue as ready for review — use the one-by-one form instead if you want the
                AI gap analysis on a lead.
              </p>
              <button
                type="button"
                onClick={downloadLeadCsvTemplate}
                className="text-sm text-accent-600 hover:underline"
              >
                Download CSV template
              </button>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">CSV file</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
                <p className="mt-1 text-xs text-gray-400">Up to 500 rows, 2 MB.</p>
              </div>
              {uploadError ? <ErrorNote error={new Error(uploadError)} /> : null}
            </>
          ) : (
            <div>
              <p className="text-sm text-gray-900">
                Imported <span className="font-medium">{result.created}</span> of{" "}
                {result.totalRows} row(s).
              </p>
              {result.errors.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1 text-sm font-medium text-red-700">
                    {result.errors.length} row(s) skipped:
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-red-600">
                    {result.errors.map((e) => (
                      <li key={e.row}>
                        Row {e.row} ({e.title || "untitled"}): {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {!result ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!file || uploading} onClick={handleUpload}>
                {uploading ? "Importing…" : "Import"}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Done</Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function LeadRowView({ lead }: { lead: LeadRow }) {
  const router = useRouter();
  return (
    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/leads/${lead.id}`)}>
      <td className="px-4 py-2.5 font-medium text-gray-900">{lead.title}</td>
      <td className="px-4 py-2.5 text-gray-600">{lead.salesOwnerName ?? "—"}</td>
      <td className="px-4 py-2.5 text-gray-600">{lead.industry ?? "—"}</td>
      <td className="px-4 py-2.5 text-gray-900">{formatMoney(lead.estRevenue, lead.currency ?? undefined)}</td>
      <td className="px-4 py-2.5">
        <ReadinessPill lead={lead} />
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(lead.createdAt)}</td>
      <td className="px-4 py-2.5 text-right text-xs text-accent-600">Review →</td>
    </tr>
  );
}

interface LeadEvaluation {
  engagementId: string;
  rfpId: string;
  title: string;
  stage: string;
  evaluation: {
    verdict: string;
    completenessPct: number;
    summary: string;
    isStub: boolean;
  };
}

function NewLeadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [requirement, setRequirement] = useState("");
  const [industry, setIndustry] = useState("");
  const [territory, setTerritory] = useState("");
  const [budgetHint, setBudgetHint] = useState("");
  const [timelineHint, setTimelineHint] = useState("");
  const [techStackText, setTechStackText] = useState("");
  const [crmOpportunityId, setCrmOpportunityId] = useState("");
  const [revenue, setRevenue] = useState("");
  const { industries } = useVocabulary();
  const { currencies, displayCurrency } = useDisplayCurrency();
  const [currency, setCurrency] = useState(displayCurrency);

  const create = useApiMutation<LeadEvaluation, Record<string, unknown>>(
    (body) => api.post("/api/leads", body),
    [["leads"], VOCABULARY_KEY],
  );

  function submit() {
    const techStack = techStackText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    create.mutate(
      {
        title,
        requirement,
        ...(industry ? { industry } : {}),
        ...(territory ? { territory } : {}),
        ...(budgetHint ? { budgetHint } : {}),
        ...(timelineHint ? { timelineHint } : {}),
        techStack,
        ...(crmOpportunityId ? { crmOpportunityId } : {}),
        // Minor units, per-currency exponent — see the same note on the
        // Engagements create form.
        ...(revenue ? { estRevenue: toMinorUnits(Number(revenue), currency).toString() } : {}),
        currency,
      },
      {
        onSuccess: (result) => {
          router.push(`/leads/${result.engagementId}`);
        },
      },
    );
  }

  const canSubmit = title.trim().length >= 3 && requirement.trim().length >= 40;

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>New Lead</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Input
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Acme Corp — D365 migration"
          />
          <div className="space-y-1.5">
            <label htmlFor="lead-requirement" className="block text-sm font-medium text-gray-900">
              Requirement, in your own words
            </label>
            <Textarea
              id="lead-requirement"
              required
              rows={5}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="What did the customer ask for? Include anything you know about scope, budget, timeline and tech stack — the portal reads this and flags what's still missing."
            />
            <p className="text-xs text-gray-400">
              {requirement.trim().length}/40 characters minimum
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ComboField label="Industry" value={industry} onChange={setIndustry} options={industries} />
            <Input
              label="Territory"
              value={territory}
              onChange={(e) => setTerritory(e.target.value)}
              placeholder="e.g. APAC"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Budget hint"
              value={budgetHint}
              onChange={(e) => setBudgetHint(e.target.value)}
              placeholder="e.g. ~$50k, not yet approved"
            />
            <Input
              label="Timeline hint"
              value={timelineHint}
              onChange={(e) => setTimelineHint(e.target.value)}
              placeholder="e.g. wants to start in Q1"
            />
          </div>
          <Input
            label="Tech stack (comma separated)"
            value={techStackText}
            onChange={(e) => setTechStackText(e.target.value)}
            placeholder="e.g. Salesforce, AWS, SAP"
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
          <Button onClick={submit} disabled={!canSubmit || create.isPending}>
            {create.isPending ? "Assessing…" : "Submit for assessment"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
