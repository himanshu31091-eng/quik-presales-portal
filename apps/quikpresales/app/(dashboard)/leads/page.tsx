"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter, Textarea } from "@quikit/ui";
import { api, useApiMutation, useApiQuery, formatDate, formatMoney, type Paginated } from "@/lib/api-client";
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

export default function LeadsPage() {
  const { can } = useMyPermissions();
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error } = useApiQuery<Paginated<LeadRow>>(
    ["leads"],
    "/api/leads?limit=50",
  );

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="New opportunities awaiting a pre-sales decision"
        actions={
          can("engagements", "create") ? (
            <Button onClick={() => setCreating(true)}>New Lead</Button>
          ) : null
        }
      />

      {error ? <ErrorNote error={error} /> : null}
      {isLoading ? (
        <Loading />
      ) : (
        <TableShell headers={["Title", "Industry", "Value", "Readiness", "Submitted", ""]}>
          {(data?.data.length ?? 0) === 0 ? (
            <EmptyRow colSpan={6} message="No leads waiting on a decision." />
          ) : (
            data?.data.map((lead) => <LeadRowView key={lead.id} lead={lead} />)
          )}
        </TableShell>
      )}

      {creating ? <NewLeadModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function LeadRowView({ lead }: { lead: LeadRow }) {
  const router = useRouter();
  return (
    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/leads/${lead.id}`)}>
      <td className="px-4 py-2.5 font-medium text-gray-900">{lead.title}</td>
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
            <label className="block text-sm font-medium text-gray-900">
              Requirement, in your own words
            </label>
            <Textarea
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
