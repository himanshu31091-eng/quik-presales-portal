import { MODEL_OPUS, callClaude, parseJsonResponse, withFallback } from "@/lib/ai/claude";

/**
 * `lead.evaluate_requirements` — read a requirement a salesperson submitted and
 * say whether pre-sales can actually work from it.
 *
 * This is the gate that makes the portal self-serve. Today a salesperson sends a
 * half-formed requirement and the pre-sales head reads it, spots what is missing
 * and asks for it — so every lead queues behind one person. Running that first
 * pass here means sales gets the gaps back in seconds and only reaches pre-sales
 * once the brief is workable.
 *
 * It deliberately does NOT judge whether the deal is worth pursuing. That is the
 * pre-sales accept/reject decision, made by a human afterwards with commercial
 * context this prompt does not have. This answers one narrower question: is there
 * enough here to scope the work?
 */

const SYSTEM_PROMPT = `You review incoming sales requirements for MoreYeahs, an IT
consulting firm delivering Microsoft, Azure, data and AI projects.

Your job is to decide whether a pre-sales engineer could begin scoping from this
brief, and to list precisely what is missing if not. You are not deciding whether
the deal is attractive — someone else does that.

A brief that can be scoped normally establishes:
- the business problem or outcome being bought, not just a technology name
- current systems and the integration surface
- rough scale: users, sites, transaction volumes, data volumes
- must-have vs nice-to-have functionality
- indicative budget or budget range
- a target timeline or hard deadline
- who decides, and what their evaluation process is
- non-functional needs: compliance, data residency, availability, security
- known constraints: incumbent vendors, existing licences, in-flight programmes

Rules:
- Judge only what is written. Do not assume a detail is present because it usually is.
- Every question must be answerable by the salesperson from the customer. Do not
  ask pre-sales to research something internally.
- Ask about what genuinely blocks scoping. Five sharp questions beat fifteen
  generic ones, and a long list trains people to ignore it.
- Distinguish a blocker (cannot scope without it) from a nice-to-have (would
  sharpen the estimate). Only blockers make a brief incomplete.
- If the brief is genuinely workable, say so and return no blockers. Do not invent
  concerns to look thorough.
- Quote or paraphrase the brief when explaining a gap, so the salesperson can see
  what you read.`;

/** Numeric bounds are omitted — the API rejects minimum/maximum in schemas. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["ready", "needs-info"] },
    completenessPct: { type: "integer" },
    summary: { type: "string" },
    blockers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          question: { type: "string" },
          why: { type: "string" },
        },
        required: ["topic", "question", "why"],
        additionalProperties: false,
      },
    },
    niceToHave: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          question: { type: "string" },
        },
        required: ["topic", "question"],
        additionalProperties: false,
      },
    },
    assumedScope: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "completenessPct", "summary", "blockers", "niceToHave", "assumedScope"],
  additionalProperties: false,
} as const;

export interface RequirementGap {
  topic: string;
  question: string;
  /** Present on blockers; absent on nice-to-haves. */
  why?: string;
  blocking: boolean;
}

export interface RequirementEvaluation {
  verdict: "ready" | "needs-info";
  completenessPct: number;
  summary: string;
  gaps: RequirementGap[];
  /** What the model believes is in scope, for the salesperson to confirm. */
  assumedScope: string[];
  tokensUsed: number;
  isStub: boolean;
}

export interface RequirementInput {
  title: string;
  requirement: string;
  industry?: string | null;
  budgetHint?: string | null;
  timelineHint?: string | null;
  techStack?: string[];
}

function buildPrompt(input: RequirementInput): string {
  const context = [
    `OPPORTUNITY: ${input.title}`,
    input.industry ? `INDUSTRY: ${input.industry}` : "",
    input.techStack?.length ? `TECHNOLOGY MENTIONED: ${input.techStack.join(", ")}` : "",
    input.budgetHint ? `BUDGET AS STATED: ${input.budgetHint}` : "BUDGET: not stated",
    input.timelineHint ? `TIMELINE AS STATED: ${input.timelineHint}` : "TIMELINE: not stated",
  ].filter(Boolean);

  return `${context.join("\n")}

REQUIREMENT AS SUBMITTED BY SALES:
"""
${input.requirement}
"""

Assess whether pre-sales can scope from this.`;
}

/** Clamp to 0-100 and keep it consistent with the verdict. */
function clampPct(raw: unknown, verdict: "ready" | "needs-info"): number {
  const fallback = verdict === "ready" ? 85 : 40;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

function toGaps(raw: unknown, blocking: boolean, limit: number): RequirementGap[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .map((g) => ({
      topic: typeof g.topic === "string" ? g.topic : "General",
      question: typeof g.question === "string" ? g.question : "",
      ...(blocking && typeof g.why === "string" ? { why: g.why } : {}),
      blocking,
    }))
    .filter((g) => g.question.trim() !== "")
    .slice(0, limit);
}

/**
 * Fallback when AI is unconfigured or the call fails.
 *
 * Deliberately `needs-info` with no invented questions: claiming a brief is ready
 * when nothing actually read it would send an unscopeable lead to pre-sales and
 * defeat the point of the gate. Better to say plainly that no check ran.
 */
function unevaluated(): RequirementEvaluation {
  return {
    verdict: "needs-info",
    completenessPct: 0,
    summary: "Not evaluated — AI is not configured for this environment. A pre-sales reviewer will read this brief manually.",
    gaps: [],
    assumedScope: [],
    tokensUsed: 0,
    isStub: true,
  };
}

export async function evaluateRequirement(
  input: RequirementInput,
): Promise<RequirementEvaluation> {
  return withFallback(
    "lead.evaluate_requirements",
    async () => {
      const response = await callClaude({
        useCase: "lead.evaluate_requirements",
        system: SYSTEM_PROMPT,
        model: MODEL_OPUS,
        maxTokens: 4000,
        effort: "high",
        prompt: buildPrompt(input),
        jsonSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      });

      if (response.isStub) return unevaluated();

      const raw = parseJsonResponse<Record<string, unknown>>(response.text);
      const verdict = raw.verdict === "ready" ? "ready" : "needs-info";
      const blockers = toGaps(raw.blockers, true, 8);

      return {
        // A brief with blockers is not ready, whatever the model labelled it.
        verdict: blockers.length > 0 ? "needs-info" : verdict,
        completenessPct: clampPct(raw.completenessPct, verdict),
        summary:
          typeof raw.summary === "string" && raw.summary.trim()
            ? raw.summary.trim()
            : "No summary returned.",
        gaps: [...blockers, ...toGaps(raw.niceToHave, false, 6)],
        assumedScope: Array.isArray(raw.assumedScope)
          ? raw.assumedScope.filter((s): s is string => typeof s === "string").slice(0, 8)
          : [],
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        isStub: false,
      };
    },
    unevaluated(),
  );
}
