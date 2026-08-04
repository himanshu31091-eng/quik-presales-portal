import { MODEL_SONNET, callClaude, withFallback, type UseCase } from "@/lib/ai/claude";

/**
 * The deal copilot — grounded question-answering and drafting over one engagement.
 *
 * Every task shares the same assembled deal context and differs only in its system
 * prompt, so a new capability is a prompt plus a registered use case rather than a
 * new endpoint.
 *
 * The hard rule across all of them: answer from the supplied context only. A
 * copilot that invents a stakeholder name, a budget or a meeting that never
 * happened is worse than one that says it does not know — a salesperson will
 * repeat it to the customer.
 *
 * Sonnet at medium effort with modest token budgets, deliberately: the deploy
 * target has a 60-second function ceiling, and a copilot that times out is useless.
 */

export const COPILOT_TASKS = [
  "summarise",
  "followup-email",
  "win-strategy",
  "competitor-analysis",
  "executive-summary",
  "ask",
] as const;

export type CopilotTask = (typeof COPILOT_TASKS)[number];

/** Registered use case per task, so AI spend is attributable. */
const USE_CASE: Record<CopilotTask, UseCase> = {
  summarise: "copilot.summarise_deal",
  "followup-email": "copilot.followup_email",
  "win-strategy": "copilot.win_strategy",
  "competitor-analysis": "copilot.competitor_analysis",
  "executive-summary": "copilot.executive_summary",
  ask: "copilot.ask",
};

export const TASK_LABEL: Record<CopilotTask, string> = {
  summarise: "Summarise this deal",
  "followup-email": "Draft a follow-up email",
  "win-strategy": "Suggest a win strategy",
  "competitor-analysis": "Analyse the competition",
  "executive-summary": "Prepare an executive summary",
  ask: "Ask a question",
};

const GROUNDING = `You are a pre-sales copilot for MoreYeahs, an IT consulting firm.

Absolute rules:
- Answer ONLY from the deal context provided. It is the complete record.
- If the context does not contain what is needed, say exactly what is missing.
  Never fill a gap with a plausible guess — the reader will repeat it to a customer.
- Never invent people, budgets, dates, meetings, commitments or competitor
  intelligence.
- Be concise. A pre-sales engineer is reading this between calls.
- Plain prose and short lists. No markdown headings, no bold, no tables.`;

const TASK_PROMPT: Record<CopilotTask, string> = {
  summarise: `${GROUNDING}

Summarise where this deal stands in under 150 words: what the customer wants, what
stage it is at, what has been produced, and what is outstanding. Lead with the
single most important fact.`,

  "followup-email": `${GROUNDING}

Draft a short follow-up email from the pre-sales team to the customer.

- Subject line, then body.
- Reference only what the context shows has actually happened.
- One clear ask, and a concrete next step.
- Professional, not effusive. No "I hope this email finds you well".
- If there is nothing substantive to follow up on, say so instead of writing filler.`,

  "win-strategy": `${GROUNDING}

Give a win strategy for this deal:
- the two or three things that will decide it
- what to do about each, concretely
- what to stop doing or de-prioritise

Base it on the actual signals — stage duration, competitors named, requirement
gaps, commercial position. If the context is too thin for a real strategy, say
which information would change the answer.`,

  "competitor-analysis": `${GROUNDING}

Analyse the competitive position from the competitors named in the context.

State plainly what is known versus what is assumption. You do NOT have market share
data, win/loss history against these competitors, or their pricing — do not imply
otherwise. Focus on how to position against them given this customer's stated
priorities, and name what intelligence would need gathering.`,

  "executive-summary": `${GROUNDING}

Write an executive summary for leadership in under 120 words: value, stage,
confidence, the main risk, and what you need from them. Written for someone who has
not read anything else about this deal.`,

  ask: `${GROUNDING}

Answer the user's question about this deal from the context. If the context does
not answer it, say so directly and state what would need to be recorded in the
portal to answer it in future.`,
};

/* ─────────────────────────── Deal context ─────────────────────────── */

export interface DealContext {
  title: string;
  stage: string;
  stageLabel: string;
  daysInStage: number;
  industry?: string | null;
  territory?: string | null;
  competitors: string[];
  techStack: string[];
  probability: number;
  estRevenueMajor: number | null;
  currency: string | null;
  expectedClose: Date | null;
  aiDealHealth?: string | null;
  riskScore?: number | null;
  /** The requirement brief, when a lead was submitted through intake. */
  requirementBrief?: string | null;
  requirements: { text: string; complianceStatus: string; responseText?: string | null }[];
  proposals: { title: string; status: string; sectionsFilled: number; sectionsTotal: number }[];
  estimates: { title: string; status: string; totalMajor: number; currency: string }[];
  demoDeliveries: { title: string | null; outcome: string; score: number | null }[];
  recentActivity: { type: string; summary: string; daysAgo: number }[];
  winLoss?: { outcome: string; reasonCategory?: string | null; reasonText?: string | null } | null;
}

function describe(ctx: DealContext): string {
  const parts: string[] = [
    `DEAL: ${ctx.title}`,
    `STAGE: ${ctx.stageLabel} (${ctx.daysInStage} days in stage), win probability ${ctx.probability}%`,
    ctx.industry ? `INDUSTRY: ${ctx.industry}` : "",
    ctx.territory ? `TERRITORY: ${ctx.territory}` : "",
    ctx.estRevenueMajor !== null
      ? `VALUE: ${ctx.estRevenueMajor} ${ctx.currency ?? "INR"}`
      : "VALUE: not set",
    ctx.expectedClose
      ? `TARGET CLOSE: ${ctx.expectedClose.toISOString().slice(0, 10)}`
      : "TARGET CLOSE: not set",
    ctx.competitors.length ? `COMPETITORS NAMED: ${ctx.competitors.join(", ")}` : "COMPETITORS: none recorded",
    ctx.techStack.length ? `TECHNOLOGY: ${ctx.techStack.join(", ")}` : "",
    ctx.aiDealHealth
      ? `LAST AI HEALTH: ${ctx.aiDealHealth}${ctx.riskScore !== null && ctx.riskScore !== undefined ? ` (risk ${ctx.riskScore}/100)` : ""}`
      : "LAST AI HEALTH: not assessed",
  ].filter(Boolean);

  if (ctx.requirementBrief) {
    parts.push(`REQUIREMENT AS SUBMITTED:\n${ctx.requirementBrief.slice(0, 4000)}`);
  }

  if (ctx.requirements.length) {
    parts.push(
      "REQUIREMENTS / OPEN QUESTIONS:\n" +
        ctx.requirements
          .map(
            (r, i) =>
              `${i + 1}. [${r.complianceStatus}] ${r.text}` +
              (r.responseText ? `\n   Answered: ${r.responseText}` : "\n   (unanswered)"),
          )
          .join("\n"),
    );
  }

  parts.push(
    ctx.proposals.length
      ? "PROPOSALS:\n" +
          ctx.proposals
            .map((p) => `- "${p.title}" (${p.status}), ${p.sectionsFilled}/${p.sectionsTotal} sections drafted`)
            .join("\n")
      : "PROPOSALS: none",
  );

  parts.push(
    ctx.estimates.length
      ? "ESTIMATES:\n" +
          ctx.estimates.map((e) => `- "${e.title}" (${e.status}) ${e.totalMajor} ${e.currency}`).join("\n")
      : "ESTIMATES: none",
  );

  parts.push(
    ctx.demoDeliveries.length
      ? "DEMOS DELIVERED:\n" +
          ctx.demoDeliveries
            .map((d) => `- ${d.title ?? "ad-hoc demo"}: ${d.outcome}${d.score !== null ? `, rated ${d.score}/5` : ""}`)
            .join("\n")
      : "DEMOS DELIVERED: none",
  );

  if (ctx.winLoss) {
    parts.push(
      `OUTCOME: ${ctx.winLoss.outcome}${ctx.winLoss.reasonCategory ? ` — ${ctx.winLoss.reasonCategory}` : ""}` +
        (ctx.winLoss.reasonText ? `\n${ctx.winLoss.reasonText}` : ""),
    );
  }

  parts.push(
    ctx.recentActivity.length
      ? "RECENT ACTIVITY:\n" +
          ctx.recentActivity.map((a) => `- ${a.daysAgo}d ago [${a.type}] ${a.summary}`).join("\n")
      : "RECENT ACTIVITY: nothing recorded",
  );

  return parts.join("\n\n");
}

export interface CopilotResult {
  task: CopilotTask;
  answer: string;
  tokensUsed: number;
  isStub: boolean;
}

function stubAnswer(task: CopilotTask): CopilotResult {
  return {
    task,
    answer:
      "The copilot is unavailable because no AI key is configured for this environment. " +
      "Every other part of this deal workspace still works — this panel needs ANTHROPIC_API_KEY set.",
    tokensUsed: 0,
    isStub: true,
  };
}

export async function runCopilot(
  task: CopilotTask,
  ctx: DealContext,
  question?: string,
): Promise<CopilotResult> {
  const useCase = USE_CASE[task];

  return withFallback(
    useCase,
    async () => {
      const response = await callClaude({
        useCase,
        system: TASK_PROMPT[task],
        model: MODEL_SONNET,
        // Kept tight so a copilot answer lands well inside the function ceiling.
        maxTokens: task === "summarise" || task === "executive-summary" ? 1200 : 2000,
        effort: "medium",
        // The deal context is the stable prefix: asking three questions about one
        // deal pays for the context roughly once.
        cachedPrefix: describe(ctx),
        prompt:
          task === "ask"
            ? `Question: ${question ?? "Summarise this deal."}`
            : "Carry out the task described in your instructions for the deal above.",
      });

      if (response.isStub) return stubAnswer(task);

      return {
        task,
        answer: response.text.trim() || "No answer returned.",
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        isStub: false,
      };
    },
    stubAnswer(task),
  );
}
