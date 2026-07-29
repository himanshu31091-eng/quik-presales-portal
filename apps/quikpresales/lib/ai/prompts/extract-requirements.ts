import {
  MODEL_OPUS,
  callClaude,
  callClaudeWithCitations,
  parseJsonResponse,
  type CitedSpan,
} from "@/lib/ai/claude";

/**
 * `rfp.extract_requirements` — turn an RFP document into a list of discrete,
 * individually-answerable requirements, each pointing back at its source text.
 *
 * Two paths, because the API will not do both citations and schema-constrained
 * JSON in one request (400):
 *   - PDF  → citations enabled, JSON asked for in the prompt and parsed here.
 *            Gives real page numbers and verbatim quotes.
 *   - text → structured output, guaranteed-parseable, `citation` left null.
 *            Used for DOCX and anything already extracted to plain text.
 */

const SYSTEM_PROMPT = `You are a pre-sales analyst extracting requirements from a customer RFP.

Rules:
- Extract every discrete, independently-answerable requirement. Split compound
  sentences that contain more than one obligation into separate requirements.
- Do not invent requirements. If the document does not state something, leave it out.
- Do not summarise or rewrite. Keep the customer's own wording in "text".
- Categorise into one of: functional, technical, security, compliance,
  commercial, delivery, support, other.
- complianceHint is your first-pass read of whether a typical IT services
  vendor can meet it: "compliant" (clearly standard), "partial" (usually met
  with caveats), "gap" (unusual or likely unmet), "clarify" (ambiguous as
  written). When unsure, use "clarify".
- Return ONLY a JSON object. No prose before or after it.`;

const OUTPUT_SHAPE = `{
  "requirements": [
    { "text": string, "category": string, "complianceHint": "compliant" | "partial" | "gap" | "clarify" }
  ]
}`;

/** JSON Schema for the text path (structured outputs). */
const REQUIREMENTS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          category: {
            type: "string",
            enum: [
              "functional",
              "technical",
              "security",
              "compliance",
              "commercial",
              "delivery",
              "support",
              "other",
            ],
          },
          complianceHint: {
            type: "string",
            enum: ["compliant", "partial", "gap", "clarify"],
          },
        },
        required: ["text", "category", "complianceHint"],
        additionalProperties: false,
      },
    },
  },
  required: ["requirements"],
  additionalProperties: false,
};

export interface ExtractedRequirement {
  text: string;
  category: string;
  complianceStatus: "compliant" | "partial" | "gap" | "clarify";
  citation: { page: number | null; quotedText: string } | null;
}

export interface ExtractionResult {
  requirements: ExtractedRequirement[];
  tokensUsed: number;
  isStub: boolean;
}

interface RawRequirement {
  text?: unknown;
  category?: unknown;
  complianceHint?: unknown;
}

const VALID_STATUS = new Set(["compliant", "partial", "gap", "clarify"]);

/**
 * Normalise whatever the model returned into rows we're willing to persist.
 * Anything without usable text is dropped rather than stored as an empty
 * requirement the user then has to clean up.
 */
function normalise(raw: unknown, citations: CitedSpan[]): ExtractedRequirement[] {
  const list = (raw as { requirements?: unknown })?.requirements;
  if (!Array.isArray(list)) return [];

  return list.flatMap((item: RawRequirement, index): ExtractedRequirement[] => {
    const text = typeof item?.text === "string" ? item.text.trim() : "";
    if (!text) return [];

    const hint = typeof item?.complianceHint === "string" ? item.complianceHint : "";
    const status = (VALID_STATUS.has(hint) ? hint : "clarify") as
      | "compliant"
      | "partial"
      | "gap"
      | "clarify";

    // Citations arrive in output order, so the Nth cited span belongs to the
    // Nth requirement. Positional rather than semantic — if the model emits a
    // different number of citations than requirements, the extras go unmapped
    // and the shortfall gets null. That's acceptable: a wrong page number is
    // worse than none, and the user reviews the matrix regardless.
    const cited = citations[index];

    return [
      {
        text,
        category: typeof item?.category === "string" ? item.category : "other",
        complianceStatus: status,
        citation: cited ? { page: cited.page, quotedText: cited.quotedText } : null,
      },
    ];
  });
}

/** Extract from a PDF, with page-level citations. */
export async function extractRequirementsFromPdf(
  pdfBase64: string,
  engagementTitle: string,
): Promise<ExtractionResult> {
  const response = await callClaudeWithCitations({
    useCase: "rfp.extract_requirements",
    system: SYSTEM_PROMPT,
    prompt: `Extract every requirement from this RFP for the engagement "${engagementTitle}".

Return a JSON object with exactly this shape:
${OUTPUT_SHAPE}`,
    pdfBase64,
    model: MODEL_OPUS,
    maxTokens: 16000,
  });

  if (response.isStub) {
    return { requirements: [], tokensUsed: 0, isStub: true };
  }

  return {
    requirements: normalise(parseJsonResponse(response.text), response.citations),
    tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
    isStub: false,
  };
}

/** Extract from already-plain text (DOCX, TXT). No citations available. */
export async function extractRequirementsFromText(
  text: string,
  engagementTitle: string,
): Promise<ExtractionResult> {
  const response = await callClaude({
    useCase: "rfp.extract_requirements",
    system: SYSTEM_PROMPT,
    model: MODEL_OPUS,
    maxTokens: 16000,
    // The document body is the stable, expensive part of the prompt — cache it
    // so a re-extraction or a follow-up compliance pass reads instead of writes.
    cachedPrefix: `RFP DOCUMENT:\n\n${text}`,
    prompt: `Extract every requirement from the RFP above, for the engagement "${engagementTitle}".`,
    jsonSchema: REQUIREMENTS_SCHEMA,
  });

  if (response.isStub) {
    return { requirements: [], tokensUsed: 0, isStub: true };
  }

  return {
    requirements: normalise(parseJsonResponse(response.text), []),
    tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
    isStub: false,
  };
}
