import { MODEL_SONNET, callClaude, parseJsonResponse, withFallback } from "@/lib/ai/claude";

/**
 * `engagement.deal_health` — score an engagement's health from pipeline signals.
 *
 * Delivers the `aiDealHealth` / `riskScore` columns on PsEngagement, which the
 * dashboard already aggregates into its deal-health breakdown (PRD §6 "AI Deal
 * Health", §18 "AI Deal Health Prediction").
 *
 * Model choice: the chokepoint's comment nominates Haiku for deal-health
 * snapshots, but `callClaude` always sends `output_config.effort` and effort is
 * rejected on Haiku 4.5, so a Haiku call would 400. Sonnet at `low` effort is
 * the cheapest thing that actually works today; revisit if the chokepoint is
 * taught to omit effort per-model.
 *
 * This reads only signals already on the record — no new columns, and nothing
 * from another app's schema.
 */

const SYSTEM_PROMPT = `You are a pre-sales operations analyst at MoreYeahs, an IT
consulting company. You assess how healthy a sales opportunity is from its
pipeline signals and return a blunt, evidence-based read.

How to judge:
- Weigh time decay heavily. An opportunity sitting in one stage far longer than
  its peers is the strongest single warning sign.
- A close date in the past, or very near with the deal still early in the
  pipeline, is a red flag.
- Missing pre-sales work for the stage matters: a deal at proposal stage with no
  proposal drafted, or past discovery with no RFP requirements captured, is
  behind.
- Named competitors raise risk; several named competitors raise it further.
- Absence of recent activity means the deal is going cold.

Scoring:
- health "green" = on track, no material concerns.
- health "amber" = recoverable concerns that need attention this week.
- health "red" = likely to slip or be lost without intervention.
- riskScore is 0-100 where 0 is no risk and 100 is near-certain loss. Keep it
  consistent with health: green is roughly 0-33, amber 34-66, red 67-100.

Score these six dimensions separately, every time:
- Engagement — recency and volume of activity on the deal
- Requirements — whether the requirement is captured and gaps closed
- Solution Fit — whether unmet capability gaps threaten the solution
- Competition — how contested the deal is
- Commercial — whether value, budget and close date hang together
- Executive Support — evidence of senior sponsorship

Each is "good", "at-risk" or "weak". Use "unknown" when the signals genuinely say
nothing about that dimension — do NOT guess "good" to fill the row.

Also return:
- winProbabilityPct: likelihood of winning. This is NOT 100 minus the risk score;
  a risky deal can still be likely, and a safe one can still be a long shot.
- biggestRisk: the single thing most likely to lose this deal.
- recommendedNextStep: one concrete action a pre-sales team can take this week.

Rules:
- Base every claim on the signals given. Do not invent meetings, contacts,
  budgets, or customer sentiment that is not in the data.
- If the signals are too thin to judge, say so in the rationale and return amber
  rather than guessing green.
- rationale: at most 2 sentences, plain and specific. Name the signal driving the
  call.
- risks and nextActions: at most 4 each, one short sentence each. nextActions
  must be things a pre-sales team can actually do.`;

/** Structured-output schema. Numeric bounds are omitted — the API rejects
 *  `minimum`/`maximum`, so riskScore is clamped in code instead. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    health: { type: "string", enum: ["green", "amber", "red"] },
    riskScore: { type: "integer" },
    winProbabilityPct: { type: "integer" },
    rationale: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    nextActions: { type: "array", items: { type: "string" } },
    /**
     * A per-dimension read, so the UI can show *where* a deal is weak rather than
     * only that it is amber. Fixed dimension list: a free-form set would make the
     * panel reshuffle between assessments and prevent trending.
     */
    dimensions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: [
              "Engagement",
              "Requirements",
              "Solution Fit",
              "Competition",
              "Commercial",
              "Executive Support",
            ],
          },
          status: { type: "string", enum: ["good", "at-risk", "weak", "unknown"] },
          note: { type: "string" },
        },
        required: ["name", "status", "note"],
        additionalProperties: false,
      },
    },
    biggestRisk: {
      type: "object",
      properties: {
        title: { type: "string" },
        severity: { type: "string", enum: ["high", "medium", "low"] },
        detail: { type: "string" },
      },
      required: ["title", "severity", "detail"],
      additionalProperties: false,
    },
    recommendedNextStep: {
      type: "object",
      properties: {
        action: { type: "string" },
        why: { type: "string" },
      },
      required: ["action", "why"],
      additionalProperties: false,
    },
  },
  required: [
    "health",
    "riskScore",
    "winProbabilityPct",
    "rationale",
    "risks",
    "nextActions",
    "dimensions",
    "biggestRisk",
    "recommendedNextStep",
  ],
  additionalProperties: false,
} as const;

/** The six dimensions the health panel always renders, in display order. */
export const HEALTH_DIMENSIONS = [
  "Engagement",
  "Requirements",
  "Solution Fit",
  "Competition",
  "Commercial",
  "Executive Support",
] as const;

export type DimensionStatus = "good" | "at-risk" | "weak" | "unknown";

export interface HealthDimension {
  name: (typeof HEALTH_DIMENSIONS)[number];
  status: DimensionStatus;
  note: string;
}

export type DealHealth = "green" | "amber" | "red";

export interface DealHealthSignals {
  title: string;
  stage: string;
  stageLabel: string;
  daysInStage: number;
  industry?: string | null;
  competitors: string[];
  techStack: string[];
  probability: number;
  /** Rupees, already converted from paise for readability. */
  estRevenue: number | null;
  currency: string | null;
  expectedClose: Date | null;
  rfpCount: number;
  requirementCount: number;
  /** Requirements marked `gap` — capabilities we do not currently meet. */
  gapCount: number;
  proposalCount: number;
  latestProposalStatus: string | null;
  /** Timeline entries in the last 14 days. */
  recentActivityCount: number;
  daysSinceLastActivity: number | null;
}

export interface DealHealthAssessment {
  health: DealHealth;
  riskScore: number;
  /** Separate from riskScore: probability of winning, not probability of trouble. */
  winProbabilityPct: number;
  rationale: string;
  risks: string[];
  nextActions: string[];
  /** Always all six, in a fixed order — see normaliseDimensions. */
  dimensions: HealthDimension[];
  biggestRisk: { title: string; severity: "high" | "medium" | "low"; detail: string } | null;
  recommendedNextStep: { action: string; why: string } | null;
  tokensUsed: number;
  isStub: boolean;
}

function describe(s: DealHealthSignals): string {
  const daysToClose =
    s.expectedClose === null
      ? null
      : Math.round((s.expectedClose.getTime() - Date.now()) / 86_400_000);

  const lines = [
    `OPPORTUNITY: ${s.title}`,
    `STAGE: ${s.stageLabel} (${s.daysInStage} days in this stage)`,
    `WIN PROBABILITY: ${s.probability}%`,
    s.industry ? `INDUSTRY: ${s.industry}` : "",
    s.estRevenue !== null ? `ESTIMATED VALUE: ${s.estRevenue} ${s.currency ?? "INR"}` : "ESTIMATED VALUE: not set",
    s.expectedClose
      ? `EXPECTED CLOSE: ${s.expectedClose.toISOString().slice(0, 10)} (${
          daysToClose !== null && daysToClose < 0
            ? `${Math.abs(daysToClose)} days OVERDUE`
            : `${daysToClose} days away`
        })`
      : "EXPECTED CLOSE: not set",
    s.competitors.length ? `COMPETITORS: ${s.competitors.join(", ")}` : "COMPETITORS: none recorded",
    s.techStack.length ? `TECHNOLOGY: ${s.techStack.join(", ")}` : "",
    `RFPs: ${s.rfpCount}; requirements captured: ${s.requirementCount}; unmet capability gaps: ${s.gapCount}`,
    `PROPOSALS: ${s.proposalCount}${
      s.latestProposalStatus ? ` (latest is ${s.latestProposalStatus})` : ""
    }`,
    `ACTIVITY: ${s.recentActivityCount} events in the last 14 days${
      s.daysSinceLastActivity !== null
        ? `; last activity ${s.daysSinceLastActivity} days ago`
        : "; no activity ever recorded"
    }`,
  ];

  return lines.filter(Boolean).join("\n");
}

/** Clamp to the documented 0-100 range and keep it consistent with `health`. */
function clampScore(raw: unknown, health: DealHealth): number {
  const fallback = health === "green" ? 20 : health === "amber" ? 50 : 80;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

function isHealth(value: unknown): value is DealHealth {
  return value === "green" || value === "amber" || value === "red";
}

/**
 * Return all six dimensions in display order, whatever the model sent.
 *
 * The panel must not reshuffle or lose a row between assessments: a dimension the
 * model omitted reads `unknown`, not "good". Silently defaulting a missing
 * dimension to healthy is the kind of error nobody notices until a deal is lost.
 */
function normaliseDimensions(raw: unknown): HealthDimension[] {
  const byName = new Map<string, HealthDimension>();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const name = HEALTH_DIMENSIONS.find((d) => d === e.name);
      if (!name) continue;
      const status: DimensionStatus =
        e.status === "good" || e.status === "at-risk" || e.status === "weak" ? e.status : "unknown";
      byName.set(name, {
        name,
        status,
        note: typeof e.note === "string" ? e.note : "",
      });
    }
  }

  return HEALTH_DIMENSIONS.map(
    (name) => byName.get(name) ?? { name, status: "unknown" as DimensionStatus, note: "Not assessed." },
  );
}

function severityOf(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, limit);
}

/**
 * Neutral result used when AI is unconfigured or the call fails. Deliberately
 * `amber`, not `green`: an unassessed deal must not read as a healthy one.
 */
function unknownAssessment(): DealHealthAssessment {
  return {
    health: "amber",
    riskScore: 50,
    winProbabilityPct: 50,
    rationale: "Not assessed — AI is not configured for this environment.",
    risks: [],
    nextActions: [],
    dimensions: normaliseDimensions(null),
    biggestRisk: null,
    recommendedNextStep: null,
    tokensUsed: 0,
    isStub: true,
  };
}

export async function assessDealHealth(
  signals: DealHealthSignals,
): Promise<DealHealthAssessment> {
  return withFallback(
    "engagement.deal_health",
    async () => {
      const response = await callClaude({
        useCase: "engagement.deal_health",
        system: SYSTEM_PROMPT,
        model: MODEL_SONNET,
        maxTokens: 2000,
        // A bounded classification over a short signal list — deeper thinking
        // buys nothing here and this runs per-engagement.
        effort: "low",
        prompt: `${describe(signals)}\n\nAssess this opportunity's health.`,
        jsonSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      });

      if (response.isStub) return unknownAssessment();

      const raw = parseJsonResponse<Record<string, unknown>>(response.text);
      const health = isHealth(raw.health) ? raw.health : "amber";

      const risk = (raw.biggestRisk ?? null) as Record<string, unknown> | null;
      const step = (raw.recommendedNextStep ?? null) as Record<string, unknown> | null;

      return {
        health,
        riskScore: clampScore(raw.riskScore, health),
        // Win probability is independent of risk — a risky deal can still be
        // likely — so it gets its own clamp rather than 100 minus the risk score.
        winProbabilityPct:
          typeof raw.winProbabilityPct === "number" && Number.isFinite(raw.winProbabilityPct)
            ? Math.min(100, Math.max(0, Math.round(raw.winProbabilityPct)))
            : Math.max(0, 100 - clampScore(raw.riskScore, health)),
        rationale:
          typeof raw.rationale === "string" && raw.rationale.trim()
            ? raw.rationale.trim()
            : "No rationale returned.",
        risks: strings(raw.risks, 4),
        nextActions: strings(raw.nextActions, 4),
        dimensions: normaliseDimensions(raw.dimensions),
        biggestRisk:
          risk && typeof risk.title === "string" && risk.title.trim()
            ? {
                title: risk.title.trim(),
                severity: severityOf(risk.severity),
                detail: typeof risk.detail === "string" ? risk.detail : "",
              }
            : null,
        recommendedNextStep:
          step && typeof step.action === "string" && step.action.trim()
            ? { action: step.action.trim(), why: typeof step.why === "string" ? step.why : "" }
            : null,
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        isStub: false,
      };
    },
    unknownAssessment(),
  );
}
