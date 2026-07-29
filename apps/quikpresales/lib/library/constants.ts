/**
 * Shared vocabularies for the Library modules (templates, demos, knowledge).
 *
 * Lives in lib/ rather than beside a route so both the list and detail
 * handlers — and the client-side filter UI — import from one place. Route
 * files should not export constants for other routes to consume.
 */

export const TEMPLATE_KINDS = [
  "discovery",
  "solution-design",
  "architecture",
  "sow",
  "scope",
  "estimation",
  "risk",
  "project-plan",
  "pricing",
  "roi",
  "proposal",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const KNOWLEDGE_KINDS = [
  "case-study",
  "success-story",
  "reference",
  "security-doc",
  "battle-card",
  "faq",
  "best-practice",
] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const DEMO_STATUSES = ["draft", "ready", "outdated"] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number];

/** Suggested values — not enforced, orgs can use their own. */
export const INDUSTRIES = [
  "Healthcare",
  "Manufacturing",
  "Retail",
  "Logistics",
  "Education",
  "Finance",
  "Construction",
  "Government",
] as const;

export const TECHNOLOGIES = [
  "Dynamics365",
  "Salesforce",
  "AzureAI",
  "DataEngineering",
  "SharePoint",
  "PowerPlatform",
  "AIAgents",
  "DevOps",
] as const;

/**
 * Build the denormalised lowercase haystack stored on `PsKnowledgeAsset.searchText`.
 * Keeping title/tags/body in one column lets a single ILIKE cover all of them
 * without a full-text index or an OR across three columns.
 */
export function buildSearchText(parts: {
  title: string;
  body?: string | null;
  tags?: string[];
  industry?: string | null;
  technology?: string | null;
}): string {
  return [parts.title, parts.body ?? "", (parts.tags ?? []).join(" "), parts.industry ?? "", parts.technology ?? ""]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100_000);
}
