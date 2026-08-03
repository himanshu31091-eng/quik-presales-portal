import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { okSerialized } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { INDUSTRIES, TECHNOLOGIES } from "@/lib/library/constants";

/**
 * GET /api/vocabulary — the open vocabularies used by the library and engagement
 * forms: industries and technologies.
 *
 * These were hardcoded lists in the UI, but the columns behind them
 * (PsEngagement.industry, PsDemo.industry/technology, PsKnowledgeAsset and
 * PsTemplate ditto) are plain free-text `String` — no enum, no foreign key. The
 * constants file even says so: "Suggested values — not enforced, orgs can use
 * their own". The dropdowns were the only thing stopping an org from using its
 * own terms.
 *
 * So this returns the seed suggestions merged with every distinct value the org
 * has actually saved. Type "Telecom" once and it is offered from then on,
 * everywhere, for that org only — an org-scoped vocabulary that grows by use,
 * with no schema change and no admin screen to maintain.
 *
 * Deliberately uncached: the whole point is that a value typed seconds ago shows
 * up in the next form. These are small, indexed, distinct-value queries.
 */
export const dynamic = "force-dynamic";

/** Ignore blank and whitespace-only values that older rows may contain. */
function clean(values: (string | null)[]): string[] {
  return values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

/** Case-insensitive dedupe that keeps the first spelling seen, then sorts. */
function merge(...groups: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const group of groups) {
    for (const value of group) {
      const key = value.toLowerCase();
      if (!seen.has(key)) seen.set(key, value);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export const GET = withOrgAuth(async ({ orgId }) => {
  const [engIndustry, demoPairs, knowledgePairs, templatePairs] = await Promise.all([
    db.psEngagement.findMany({
      where: { orgId, deletedAt: null, NOT: { industry: null } },
      select: { industry: true },
      distinct: ["industry"],
    }),
    db.psDemo.findMany({
      where: { orgId, deletedAt: null },
      select: { industry: true, technology: true },
      distinct: ["industry", "technology"],
    }),
    db.psKnowledgeAsset.findMany({
      where: { orgId, deletedAt: null },
      select: { industry: true, technology: true },
      distinct: ["industry", "technology"],
    }),
    db.psTemplate.findMany({
      where: { orgId, deletedAt: null },
      select: { industry: true, technology: true },
      distinct: ["industry", "technology"],
    }),
  ]);

  const industries = merge(
    [...INDUSTRIES],
    clean(engIndustry.map((r) => r.industry)),
    clean(demoPairs.map((r) => r.industry)),
    clean(knowledgePairs.map((r) => r.industry)),
    clean(templatePairs.map((r) => r.industry)),
  );

  const technologies = merge(
    [...TECHNOLOGIES],
    clean(demoPairs.map((r) => r.technology)),
    clean(knowledgePairs.map((r) => r.technology)),
    clean(templatePairs.map((r) => r.technology)),
  );

  return okSerialized({ industries, technologies });
});
