import { MODEL_OPUS, callClaude, withFallback } from "@/lib/ai/claude";
import { sanitizeSectionHtml } from "@/lib/proposals/sections";

/**
 * `proposal.generate_section` — draft one proposal section.
 *
 * Returns HTML (not JSON), because the editor is rich-text and a schema would
 * only add a parse step. The model is told the exact tag vocabulary the
 * exporters support, and everything else is stripped on the way out.
 */

const SYSTEM_PROMPT = `You write B2B IT services proposals for MoreYeahs, an IT
consulting and services company.

Rules:
- Write ONLY the body of the requested section. No section heading — the
  document template supplies it.
- Output HTML using only these tags: <p> <strong> <em> <ul> <ol> <li> <h4>
  <table> <thead> <tbody> <tr> <th> <td> <br>. No <h1>, <h2>, <h3>, no inline
  styles, no classes.
- Do NOT invent facts. No specific client names, headcounts, dates, prices,
  certifications, or metrics unless they appear in the context provided. Where a
  concrete figure is needed and not supplied, write a clearly-marked placeholder
  such as <strong>[TBC: team size]</strong>.
- Address the customer's stated requirements directly. Prefer their vocabulary
  over generic marketing language.
- Be specific and concise. No filler, no restating the section title back.`;

export interface SectionContext {
  sectionTitle: string;
  engagementTitle: string;
  industry?: string | null;
  techStack?: string[];
  /** Requirements from the linked RFP, if any. */
  requirements?: { text: string; complianceStatus: string; responseText?: string | null }[];
  /** Retrieved knowledge assets used as grounding. */
  knowledge?: { title: string; body: string }[];
  /** Existing sections, so the model doesn't repeat what's already written. */
  existingSections?: { title: string; text: string }[];
}

/**
 * Everything stable about the engagement. Passed as the cached prefix so that
 * generating ten sections for one proposal pays the input cost roughly once.
 * Section-specific instructions go in the (uncached) prompt.
 */
function buildContext(ctx: SectionContext): string {
  const parts: string[] = [
    `ENGAGEMENT: ${ctx.engagementTitle}`,
    ctx.industry ? `INDUSTRY: ${ctx.industry}` : "",
    ctx.techStack?.length ? `TECHNOLOGY: ${ctx.techStack.join(", ")}` : "",
  ].filter(Boolean);

  if (ctx.requirements?.length) {
    parts.push(
      "CUSTOMER REQUIREMENTS:\n" +
        ctx.requirements
          .map(
            (r, i) =>
              `${i + 1}. [${r.complianceStatus}] ${r.text}` +
              (r.responseText ? `\n   Our position: ${r.responseText}` : ""),
          )
          .join("\n"),
    );
  }

  if (ctx.knowledge?.length) {
    parts.push(
      "REFERENCE MATERIAL (use only what is relevant; do not quote verbatim):\n" +
        ctx.knowledge.map((k) => `--- ${k.title} ---\n${k.body}`).join("\n\n"),
    );
  }

  if (ctx.existingSections?.length) {
    parts.push(
      "ALREADY WRITTEN (do not repeat):\n" +
        ctx.existingSections
          .filter((s) => s.text.trim())
          .map((s) => `## ${s.title}\n${s.text.slice(0, 1500)}`)
          .join("\n\n"),
    );
  }

  return parts.join("\n\n");
}

export interface GeneratedSection {
  html: string;
  tokensUsed: number;
  isStub: boolean;
}

/** Fallback body used when AI is unconfigured or the call fails. */
function placeholder(sectionTitle: string): string {
  return `<p><em>[${sectionTitle} — not yet drafted. Set ANTHROPIC_API_KEY to generate this section, or write it manually.]</em></p>`;
}

export async function generateProposalSection(
  ctx: SectionContext,
): Promise<GeneratedSection> {
  return withFallback(
    "proposal.generate_section",
    async () => {
      const response = await callClaude({
        useCase: "proposal.generate_section",
        system: SYSTEM_PROMPT,
        model: MODEL_OPUS,
        maxTokens: 8000,
        effort: "high",
        cachedPrefix: buildContext(ctx),
        prompt: `Using the context above, write the "${ctx.sectionTitle}" section of this proposal.`,
      });

      if (response.isStub) {
        return { html: placeholder(ctx.sectionTitle), tokensUsed: 0, isStub: true };
      }

      const html = sanitizeSectionHtml(response.text);
      return {
        // A model reply that sanitises down to nothing is a failed generation,
        // not an intentionally empty section — show the placeholder instead.
        html: html || placeholder(ctx.sectionTitle),
        tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
        isStub: false,
      };
    },
    { html: placeholder(ctx.sectionTitle), tokensUsed: 0, isStub: true },
  );
}
