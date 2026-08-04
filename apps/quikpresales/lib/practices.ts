/**
 * MoreYeahs delivery practices.
 *
 * A practice is the capability group that will deliver the work — it is how the
 * business is organised and how pipeline is reported to leadership, so it is a
 * real attribute of a deal, not a derived label.
 *
 * ⚠️ INTERIM IMPLEMENTATION. `PsEngagement` has no `practice` column, and adding
 * one means editing packages/database, which app teams cannot do. Until that
 * migration lands, practice is DERIVED from the technologies recorded on the deal
 * via the mapping below.
 *
 * Consequences of deriving that a reader should know:
 *   - a deal with no technology recorded falls into "Unassigned"
 *   - a deal spanning two practices is attributed to the first match in
 *     PRACTICES order, so pipeline is never double-counted
 *   - the mapping is a guess about intent; a Microsoft-stack deal delivered by the
 *     Cloud practice will be mis-attributed and nobody can correct it
 *
 * Once the column exists, `practiceOf` should prefer the stored value and keep
 * this mapping only as a backfill for historical rows. See the migration request
 * in PROJECT-HANDOFF.md.
 *
 * Client-safe: no server imports.
 */

export const PRACTICES = [
  "Salesforce",
  "Microsoft",
  "AI & Data",
  "Cloud",
  "DevOps",
  "Unassigned",
] as const;

export type Practice = (typeof PRACTICES)[number];

/**
 * Technology → practice. Keys match the TECHNOLOGIES vocabulary, compared
 * case-insensitively so a hand-typed value still lands somewhere sensible.
 */
const TECH_TO_PRACTICE: Record<string, Practice> = {
  salesforce: "Salesforce",
  dynamics365: "Microsoft",
  sharepoint: "Microsoft",
  powerplatform: "Microsoft",
  azureai: "AI & Data",
  dataengineering: "AI & Data",
  aiagents: "AI & Data",
  azure: "Cloud",
  aws: "Cloud",
  gcp: "Cloud",
  devops: "DevOps",
};

/**
 * The practice a deal belongs to.
 *
 * Resolution order follows PRACTICES, so a deal tagged both Dynamics365 and
 * DevOps counts once, under Microsoft. Deterministic attribution matters more
 * than picking the "best" match — an inconsistent rule would make pipeline totals
 * move between refreshes.
 */
export function practiceOf(techStack: string[] | null | undefined): Practice {
  if (!techStack || techStack.length === 0) return "Unassigned";

  const matched = new Set<Practice>();
  for (const tech of techStack) {
    const practice = TECH_TO_PRACTICE[tech.trim().toLowerCase()];
    if (practice) matched.add(practice);
  }
  if (matched.size === 0) return "Unassigned";

  return PRACTICES.find((p) => matched.has(p)) ?? "Unassigned";
}

/** True when the deal's technologies map to more than one practice. */
export function spansMultiplePractices(techStack: string[] | null | undefined): boolean {
  if (!techStack) return false;
  const matched = new Set<Practice>();
  for (const tech of techStack) {
    const practice = TECH_TO_PRACTICE[tech.trim().toLowerCase()];
    if (practice) matched.add(practice);
  }
  return matched.size > 1;
}
