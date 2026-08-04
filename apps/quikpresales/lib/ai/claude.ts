import Anthropic from "@anthropic-ai/sdk";

/**
 * Single chokepoint for every Claude call in QuikPreSales.
 *
 * Centralising here lets us swap models, add caching, and log token spend in
 * one place. Structured to match the `QuikitAI` contract documented in
 * apps/quiktrack/CLAUDE.md (a registered `useCase` on every call, a fallback
 * on every AI surface, mockable in tests) so it can be replaced by the shared
 * `@quikit/ai-sdk` later with minimal churn. Do not call the Anthropic SDK
 * directly from a route or component.
 *
 * Stub mode: with no ANTHROPIC_API_KEY the app still renders — every caller
 * gets deterministic placeholder output flagged `isStub` so the UI can badge
 * it rather than pretending it's real analysis.
 *
 * API notes that are easy to get wrong on the current models:
 *   - `temperature` / `top_p` / `top_k` are REJECTED (400) on Opus 5 and
 *     Sonnet 5. Steer with the prompt instead.
 *   - `thinking.budget_tokens` is removed (400). Use `effort`.
 *   - Citations and structured outputs are mutually exclusive — a request
 *     with both `citations.enabled` and `output_config.format` returns 400.
 *     See `callClaudeWithCitations` below.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const isAIEnabled = !!ANTHROPIC_API_KEY;

const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

/** Heavy reasoning: full proposals, architecture narrative, long RFP synthesis. */
export const MODEL_OPUS = "claude-opus-5";
/** Balanced default: most generation and Q&A. */
export const MODEL_SONNET = "claude-sonnet-5";
/** Cheap and fast: classification, tagging, deal-health snapshots. */
export const MODEL_HAIKU = "claude-haiku-4-5";

/** Effort controls thinking depth and total token spend. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Registered AI use cases. Adding a feature means adding a member here first —
 * this is the `useCase` string the future shared SDK will key telemetry on.
 */
export type UseCase =
  | "rfp.extract_requirements"
  | "rfp.compliance_matrix"
  | "rfp.clarification_questions"
  | "proposal.generate_section"
  | "proposal.assemble"
  | "sow.generate"
  | "architecture.assist"
  | "estimate.suggest_lines"
  | "meeting.summarize"
  | "engagement.deal_health"
  | "lead.evaluate_requirements"
  | "copilot.summarise_deal"
  | "copilot.followup_email"
  | "copilot.win_strategy"
  | "copilot.competitor_analysis"
  | "copilot.executive_summary"
  | "copilot.ask";

export interface ClaudeCallOptions {
  useCase: UseCase;
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  effort?: Effort;
  /**
   * Content placed before `prompt` and marked with `cache_control`. Use for the
   * stable prefix — template + boilerplate + retrieved knowledge + RFP text.
   * Only caches above the model's minimum prefix (512 tokens on Opus 5, 1024 on
   * Sonnet 5); below that it silently won't cache, which is harmless.
   */
  cachedPrefix?: string;
  /** JSON Schema. When set, the model is constrained to emit matching JSON. */
  jsonSchema?: Record<string, unknown>;
}

export interface ClaudeResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  model: string;
  /** True when no API key is configured and `text` is a placeholder. */
  isStub: boolean;
}

/** Strip the markdown fences the model sometimes wraps JSON in. */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json|ts|tsx|js)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

/** Parse JSON output, tolerating code fences. Throws on invalid JSON. */
export function parseJsonResponse<T>(raw: string): T {
  return JSON.parse(stripCodeFences(raw)) as T;
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function stubResponse(useCase: UseCase, prompt: string): ClaudeResponse {
  return {
    text: `[AI stub — ANTHROPIC_API_KEY not configured]\n\nuseCase: ${useCase}\nprompt: ${prompt.slice(0, 160)}…`,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    model: "stub",
    isStub: true,
  };
}

/**
 * Call Claude. Never throws for a missing key — callers get a stub instead.
 * API failures DO throw; wrap in `withFallback` at the call site so a broken
 * model call can't reject an otherwise-valid record.
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeResponse> {
  const {
    useCase,
    system,
    prompt,
    model = MODEL_SONNET,
    maxTokens = 8000,
    effort = "high",
    cachedPrefix,
    jsonSchema,
  } = opts;

  if (!client) return stubResponse(useCase, prompt);

  const content: Anthropic.TextBlockParam[] = [];
  if (cachedPrefix) {
    content.push({
      type: "text",
      text: cachedPrefix,
      cache_control: { type: "ephemeral" },
    });
  }
  content.push({ type: "text", text: prompt });

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
    output_config: {
      effort,
      ...(jsonSchema ? { format: { type: "json_schema", schema: jsonSchema } } : {}),
    },
  } as Anthropic.MessageCreateParamsNonStreaming);

  return {
    text: textOf(message),
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    },
    model: message.model,
    isStub: false,
  };
}

export interface CitedSpan {
  /** 1-indexed page, when the source was a PDF. */
  page: number | null;
  quotedText: string;
}

export interface CitedClaudeResponse extends ClaudeResponse {
  /** One entry per cited text block, in output order. */
  citations: CitedSpan[];
}

/**
 * Call Claude over a PDF with citations enabled, so extracted requirements can
 * point at the exact source page and quote.
 *
 * Deliberately does NOT accept a `jsonSchema`: the API rejects a request that
 * sets both `citations.enabled` and `output_config.format` with a 400. The
 * prompt therefore has to ask for JSON and we parse it ourselves — which is
 * why callers must tolerate a parse failure rather than assume valid JSON.
 */
export async function callClaudeWithCitations(opts: {
  useCase: UseCase;
  system: string;
  prompt: string;
  /** Base64-encoded PDF bytes, no data: prefix and no newlines. */
  pdfBase64: string;
  model?: string;
  maxTokens?: number;
  effort?: Effort;
}): Promise<CitedClaudeResponse> {
  const {
    useCase,
    system,
    prompt,
    pdfBase64,
    model = MODEL_OPUS,
    maxTokens = 16000,
    effort = "high",
  } = opts;

  if (!client) return { ...stubResponse(useCase, prompt), citations: [] };

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    output_config: { effort },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            citations: { enabled: true },
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const citations: CitedSpan[] = [];
  for (const block of message.content) {
    if (block.type !== "text" || !block.citations) continue;
    for (const c of block.citations) {
      citations.push({
        page: c.type === "page_location" ? c.start_page_number : null,
        quotedText: c.cited_text,
      });
    }
  }

  return {
    text: textOf(message),
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    },
    model: message.model,
    isStub: false,
    citations,
  };
}

/**
 * Run an AI call, falling back to a deterministic value if it throws.
 *
 * Every AI surface goes through this. A generation failure must degrade to a
 * placeholder, never reject the record the user was trying to save.
 */
export async function withFallback<T>(
  useCase: UseCase,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console -- surfacing AI failures is intentional
    console.error(`[ai:${useCase}] failed, using fallback: ${message}`);
    return fallback;
  }
}
