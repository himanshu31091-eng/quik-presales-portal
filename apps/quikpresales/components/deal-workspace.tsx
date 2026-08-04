"use client";

import { cn } from "@/lib/utils";
import { Panel, StatusPill } from "@/components/ui-kit";

/**
 * Deal workspace chrome — the header strip, stage tracker and AI panels.
 *
 * Composition over @quikit/ui primitives; nothing here re-implements a shared
 * component. Kept separate from the page so the page stays a layout and these can
 * be reused by a future account or portfolio view.
 */

/* ───────────────────────────── Header ───────────────────────────── */

export function DealHeaderStat({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  hint?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : "text-gray-900";

  return (
    <div className="min-w-[110px]">
      <p className={cn("text-lg font-semibold leading-tight", toneClass)}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}

/* ────────────────────────── Stage tracker ────────────────────────── */

export interface StageStep {
  stage: string;
  label: string;
  state: "done" | "current" | "upcoming" | "skipped";
  enteredAt: string | null;
}

/**
 * Horizontal stage tracker.
 *
 * Four states, not two. `skipped` matters: real deals jump PoC or demo, and
 * painting those the same green as completed stages would claim work that never
 * happened. Skipped steps read as passed-through rather than achieved.
 */
export function StageTracker({ steps }: { steps: StageStep[] }) {
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-max items-start gap-0 py-1">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const done = step.state === "done";
          const current = step.state === "current";
          const skipped = step.state === "skipped";

          return (
            <li key={step.stage} className="flex items-start">
              <div className="flex w-[104px] flex-col items-center text-center">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
                    done && "border-green-500 bg-green-500 text-white",
                    current && "border-accent-500 bg-white text-accent-600 ring-4 ring-accent-100",
                    skipped && "border-gray-300 bg-gray-100 text-gray-400",
                    step.state === "upcoming" && "border-gray-200 bg-white text-gray-300",
                  )}
                >
                  {done ? "✓" : skipped ? "–" : current ? "●" : i + 1}
                </span>
                <span
                  className={cn(
                    "mt-1.5 text-xs leading-tight",
                    current ? "font-semibold text-gray-900" : "text-gray-600",
                  )}
                >
                  {step.label}
                </span>
                <span className="text-[11px] text-gray-400">
                  {step.enteredAt
                    ? new Date(step.enteredAt).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                      })
                    : current
                      ? "In progress"
                      : skipped
                        ? "Skipped"
                        : "Upcoming"}
                </span>
              </div>
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn("mt-3 h-0.5 w-6 shrink-0", done ? "bg-green-400" : "bg-gray-200")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ──────────────────────── AI health panels ──────────────────────── */

export interface HealthDimension {
  name: string;
  status: "good" | "at-risk" | "weak" | "unknown";
  note: string;
}

export interface DealAssessment {
  assessedAt: string | null;
  health: string | null;
  riskScore: number | null;
  winProbabilityPct: number | null;
  rationale: string | null;
  risks: string[];
  nextActions: string[];
  dimensions: HealthDimension[];
  biggestRisk: { title: string; severity: string; detail: string } | null;
  recommendedNextStep: { action: string; why: string } | null;
  isStub: boolean;
}

const DIMENSION_TONE: Record<HealthDimension["status"], string> = {
  good: "bg-green-50 text-green-700",
  "at-risk": "bg-amber-50 text-amber-700",
  weak: "bg-red-50 text-red-700",
  unknown: "bg-gray-100 text-gray-500",
};

const DIMENSION_LABEL: Record<HealthDimension["status"], string> = {
  good: "Good",
  "at-risk": "At Risk",
  weak: "Weak",
  unknown: "—",
};

/**
 * Deal health: a probability arc, the six dimensions, and the risk score.
 *
 * The arc is inline SVG rather than a chart library — it is one value on one arc,
 * and pulling in a charting dependency for that would be disproportionate.
 */
export function DealHealthPanel({ assessment }: { assessment: DealAssessment | null }) {
  if (!assessment) {
    return (
      <Panel title="Deal Health">
        <p className="py-4 text-sm text-gray-400">
          No assessment yet. Run <span className="font-medium">Assess deal health</span> to score
          this deal across engagement, requirements, solution fit, competition, commercials and
          executive support.
        </p>
      </Panel>
    );
  }

  const pct = assessment.winProbabilityPct ?? 0;
  // Semi-circular arc: 0% sweeps nothing, 100% sweeps the full 180°.
  const RADIUS = 52;
  const circumference = Math.PI * RADIUS;
  const dash = (pct / 100) * circumference;

  const arcColour = pct >= 66 ? "#16a34a" : pct >= 33 ? "#d97706" : "#dc2626";

  return (
    <Panel title="Deal Health">
      {assessment.isStub ? (
        <p className="mb-3 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
          Placeholder — AI is not configured, so this is not a real assessment.
        </p>
      ) : null}

      <div className="flex flex-col items-center">
        <svg viewBox="0 0 130 74" className="h-[74px] w-[130px]" role="img"
          aria-label={`AI win probability ${pct} percent`}>
          <path
            d={`M 13 66 A ${RADIUS} ${RADIUS} 0 0 1 117 66`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path
            d={`M 13 66 A ${RADIUS} ${RADIUS} 0 0 1 117 66`}
            fill="none"
            stroke={arcColour}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
          <text x="65" y="60" textAnchor="middle" className="fill-gray-900 text-[20px] font-semibold">
            {pct}%
          </text>
        </svg>
        <div className="-mt-1 flex items-center gap-2">
          {assessment.health ? <StatusPill status={assessment.health} /> : null}
          <span className="text-xs text-gray-500">AI win probability</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        {assessment.dimensions.map((d) => (
          <div key={d.name} className="flex items-center justify-between gap-2" title={d.note}>
            <dt className="truncate text-xs text-gray-600">{d.name}</dt>
            <dd
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                DIMENSION_TONE[d.status],
              )}
            >
              {DIMENSION_LABEL[d.status]}
            </dd>
          </div>
        ))}
      </dl>

      {assessment.riskScore !== null ? (
        <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
          Risk score <span className="font-medium text-gray-900">{assessment.riskScore}/100</span>
          {assessment.assessedAt
            ? ` · assessed ${new Date(assessment.assessedAt).toLocaleDateString()}`
            : ""}
        </p>
      ) : null}
    </Panel>
  );
}

/** The "what the customer wants / key insights" pair from the AI assessment. */
export function AiSnapshotPanel({ assessment }: { assessment: DealAssessment | null }) {
  if (!assessment) {
    return (
      <Panel title="AI Deal Snapshot">
        <p className="py-4 text-sm text-gray-400">
          Runs with the deal-health assessment — it summarises the position, the biggest risk and
          the next step worth taking.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="AI Deal Snapshot">
      {assessment.rationale ? (
        <p className="text-sm text-gray-700">{assessment.rationale}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-red-100 bg-red-50/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-red-700">
            Biggest risk
          </p>
          {assessment.biggestRisk ? (
            <>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {assessment.biggestRisk.title}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">{assessment.biggestRisk.detail}</p>
              <span className="mt-1.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                {assessment.biggestRisk.severity}
              </span>
            </>
          ) : (
            <p className="mt-1 text-xs text-gray-500">None identified.</p>
          )}
        </div>

        <div className="rounded-md border border-accent-100 bg-accent-50/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-accent-700">
            Recommended next step
          </p>
          {assessment.recommendedNextStep ? (
            <>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {assessment.recommendedNextStep.action}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">{assessment.recommendedNextStep.why}</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-gray-500">Nothing recommended.</p>
          )}
        </div>
      </div>

      {assessment.risks.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-700">Open risks</p>
          <ul className="ml-4 list-disc text-xs text-gray-600">
            {assessment.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * Competition panel.
 *
 * Named competitors come from the engagement record. Deliberately no invented
 * win-share percentages: the mockup shows figures like "Accenture 40%", but there
 * is no data behind such a number and printing a fabricated one on a leadership
 * screen is worse than leaving it out. The AI's competition dimension supplies the
 * qualitative read instead.
 */
export function CompetitionPanel({
  competitors,
  assessment,
}: {
  competitors: string[];
  assessment: DealAssessment | null;
}) {
  const competitionRead = assessment?.dimensions.find((d) => d.name === "Competition");

  return (
    <Panel title="Competition">
      {competitors.length === 0 ? (
        <p className="text-sm text-gray-400">No competitors recorded on this deal.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {competitors.map((c) => (
            <li key={c} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-900">{c}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                Named
              </span>
            </li>
          ))}
        </ul>
      )}

      {competitionRead && competitionRead.status !== "unknown" ? (
        <div className="mt-3 rounded-md bg-accent-50/60 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-accent-700">
            AI read
          </p>
          <p className="mt-0.5 text-xs text-gray-700">{competitionRead.note}</p>
        </div>
      ) : null}
    </Panel>
  );
}
