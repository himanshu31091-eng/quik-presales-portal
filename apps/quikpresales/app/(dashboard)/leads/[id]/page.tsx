"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Button,
  Select,
  Textarea,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@quikit/ui";
import { api, useApiMutation, useApiQuery, formatMoney } from "@/lib/api-client";
import { PageHeader, Panel, StatusPill, Loading, ErrorNote } from "@/components/ui-kit";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { REJECTION_REASONS, REJECTION_REASON_LABEL, type RejectionReason } from "@/lib/leads/rejection";

interface EngagementSummary {
  id: string;
  title: string;
  industry: string | null;
  territory: string | null;
  stage: string;
  estRevenue: string | null;
  currency: string | null;
  techStack: string[];
  crmOpportunityId: string | null;
}

interface RfpSummary {
  id: string;
  status: string;
  _count: { requirements: number };
}

interface RfpDetail {
  id: string;
  extractedText: string | null;
  answeredCount: number;
}

interface Requirement {
  id: string;
  complianceStatus: string;
  responseText: string | null;
}

interface MatrixResponse {
  requirements: Requirement[];
  summary: Record<string, number>;
  total: number;
}

const STATUSES = ["compliant", "partial", "gap", "clarify"] as const;

export default function LeadReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useMyPermissions();

  const engagement = useApiQuery<EngagementSummary>(["engagement", id], `/api/engagements/${id}`);
  const rfps = useApiQuery<{ data: RfpSummary[] }>(
    ["rfps", "for-engagement", id],
    `/api/rfps?engagementId=${id}&limit=1`,
  );
  const rfpId = rfps.data?.data[0]?.id;

  const rfp = useApiQuery<RfpDetail>(["rfp", rfpId], `/api/rfps/${rfpId}`, !!rfpId);
  const matrix = useApiQuery<MatrixResponse>(
    ["rfp", rfpId, "requirements"],
    `/api/rfps/${rfpId}/requirements`,
    !!rfpId,
  );

  const [rejecting, setRejecting] = useState(false);
  const [confirmingAccept, setConfirmingAccept] = useState(false);

  const decide = useApiMutation<{ stage: string }, Record<string, unknown>>(
    (body) => api.post(`/api/leads/${id}/decision`, body),
    [["leads"], ["engagement", id], ["engagements"], ["dashboard"]],
  );

  if (engagement.isLoading) return <Loading />;
  if (engagement.error) return <ErrorNote error={engagement.error} />;
  if (!engagement.data) return null;

  const data = engagement.data;
  const isPendingDecision = data.stage === "lead";

  const openBlockers =
    matrix.data?.requirements.filter(
      (r) => r.complianceStatus === "gap" && (r.responseText ?? "").trim() === "",
    ).length ?? 0;

  function accept(override: boolean) {
    decide.mutate(
      { decision: "accept", overrideOpenBlockers: override },
      { onSuccess: () => router.push(`/engagements/${id}`) },
    );
  }

  return (
    <div>
      <PageHeader
        title={data.title}
        subtitle={[data.industry, data.territory].filter(Boolean).join(" · ") || undefined}
        actions={
          isPendingDecision && can("engagements", "approve") ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setRejecting(true)}
                disabled={decide.isPending}
              >
                Reject
              </Button>
              <Button
                onClick={() => (openBlockers > 0 ? setConfirmingAccept(true) : accept(false))}
                disabled={decide.isPending || matrix.isLoading}
              >
                {decide.isPending ? "Deciding…" : "Accept into pipeline"}
              </Button>
            </div>
          ) : (
            <StatusPill status={data.stage} label={STAGE_LABEL[data.stage as Stage] ?? data.stage} />
          )
        }
      />

      {!isPendingDecision ? (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          This lead has already been decided — it&apos;s now at stage{" "}
          <strong>{STAGE_LABEL[data.stage as Stage] ?? data.stage}</strong>.{" "}
          <Link href={`/engagements/${id}`} className="underline">
            View the engagement
          </Link>
          .
        </div>
      ) : null}

      {decide.error ? (
        <div className="mb-4">
          <ErrorNote error={decide.error} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel title="The Brief">
            {rfp.isLoading ? (
              <Loading />
            ) : rfp.data?.extractedText ? (
              <p className="whitespace-pre-wrap text-sm text-gray-700">{rfp.data.extractedText}</p>
            ) : (
              <p className="text-sm text-gray-400">No brief text recorded.</p>
            )}
          </Panel>

          <Panel
            title="Requirement Assessment"
            actions={
              rfpId ? (
                <Link href={`/rfps/${rfpId}`} className="text-xs text-accent-600 hover:underline">
                  Open full compliance matrix →
                </Link>
              ) : null
            }
          >
            {matrix.isLoading ? (
              <Loading />
            ) : (matrix.data?.total ?? 0) === 0 ? (
              <p className="text-sm text-gray-400">No requirement gaps were flagged for this brief.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {STATUSES.map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <StatusPill status={s} />
                    <span className="text-sm text-gray-500">{matrix.data?.summary[s] ?? 0}</span>
                  </span>
                ))}
                <span className="text-sm text-gray-500">
                  · {rfp.data?.answeredCount ?? 0} of {matrix.data?.total ?? 0} answered
                </span>
                {openBlockers > 0 ? (
                  <span className="text-sm font-medium text-red-600">
                    {openBlockers} blocking question{openBlockers === 1 ? "" : "s"} still open
                  </span>
                ) : null}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Deal Facts">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Estimated revenue</dt>
                <dd className="text-gray-900">{formatMoney(data.estRevenue, data.currency ?? undefined)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Territory</dt>
                <dd className="text-gray-900">{data.territory ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">CRM opportunity</dt>
                <dd className="text-gray-900">{data.crmOpportunityId ?? "—"}</dd>
              </div>
              {data.techStack.length > 0 ? (
                <div>
                  <dt className="mb-1.5 text-gray-500">Tech stack</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {data.techStack.map((t) => (
                      <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {t}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Panel>
        </div>
      </div>

      {confirmingAccept ? (
        <ConfirmOverrideModal
          openBlockers={openBlockers}
          rfpId={rfpId}
          pending={decide.isPending}
          onCancel={() => setConfirmingAccept(false)}
          onConfirm={() => {
            setConfirmingAccept(false);
            accept(true);
          }}
        />
      ) : null}

      {rejecting ? (
        <RejectModal
          pending={decide.isPending}
          onCancel={() => setRejecting(false)}
          onConfirm={(reasonCategory, reasonText) => {
            decide.mutate(
              { decision: "reject", reasonCategory, reasonText },
              { onSuccess: () => router.push("/leads") },
            );
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmOverrideModal({
  openBlockers,
  rfpId,
  pending,
  onCancel,
  onConfirm,
}: {
  openBlockers: number;
  rfpId: string | undefined;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open onOpenChange={onCancel}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>
            {openBlockers} blocking question{openBlockers === 1 ? "" : "s"} still unanswered
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-gray-600">
            Accepting now moves this into the pipeline before sales has closed those gaps. You can
            answer them first, or accept anyway and chase them from inside the engagement.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          {rfpId ? (
            <Link href={`/rfps/${rfpId}`}>
              <Button variant="secondary">Answer them first</Button>
            </Link>
          ) : null}
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Accepting…" : "Accept anyway"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function RejectModal({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reasonCategory: RejectionReason, reasonText: string) => void;
}) {
  const [reasonCategory, setReasonCategory] = useState<RejectionReason>(REJECTION_REASONS[0]);
  const [reasonText, setReasonText] = useState("");
  const canSubmit = reasonText.trim().length >= 10;

  return (
    <Modal open onOpenChange={onCancel}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Reject this lead</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-3">
          <Select
            label="Reason"
            value={reasonCategory}
            onChange={(e) => setReasonCategory(e.target.value as RejectionReason)}
            options={REJECTION_REASONS.map((r) => ({ value: r, label: REJECTION_REASON_LABEL[r] }))}
          />
          <div className="space-y-1.5">
            <label htmlFor="lead-reject-reason" className="block text-sm font-medium text-gray-900">
              Explain (visible to sales)
            </label>
            <Textarea
              id="lead-reject-reason"
              rows={4}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="What should sales know or fix before resubmitting something like this?"
            />
          </div>
          <p className="text-xs text-gray-400">{reasonText.trim().length}/10 characters minimum</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(reasonCategory, reasonText)}
            disabled={!canSubmit || pending}
          >
            {pending ? "Rejecting…" : "Reject lead"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
