import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, validationError } from "@/lib/api/responses";
import { db } from "@/lib/db";

const withKnowledgeAuth = withOrgAuthForModule("library.knowledge");

const searchQuery = z.object({
  q: z.string().min(2, "Query must be at least 2 characters").max(200),
  kind: z.string().max(40).optional(),
  industry: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * GET /api/knowledge/search?q=...
 *
 * ILIKE over the denormalised `searchText` column. Deliberately not pgvector:
 * enabling that extension is a shared database change, out of scope for an app
 * team. Every term must appear somewhere in the haystack (AND, not OR) — with
 * a few hundred assets that's precise enough, and OR would return most of the
 * library for any two-word query.
 *
 * The AI path re-ranks these results; this is the prefilter, not the answer.
 */
export const GET = withKnowledgeAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "knowledge", "view");
  if (denied) return denied;

  const parsed = searchQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { q, kind, industry, limit } = parsed.data;

  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 8);

  if (terms.length === 0) {
    return okSerialized({ results: [], query: q, total: 0 });
  }

  const where: Prisma.PsKnowledgeAssetWhereInput = {
    orgId,
    deletedAt: null,
    ...(kind && { kind }),
    ...(industry && { industry }),
    AND: terms.map((term) => ({
      searchText: { contains: term, mode: "insensitive" as const },
    })),
  };

  const results = await db.psKnowledgeAsset.findMany({
    where,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      industry: true,
      technology: true,
      tags: true,
      blobUrl: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return okSerialized({
    query: q,
    total: results.length,
    results: results.map((r) => ({
      ...r,
      // Trim the body to a snippet — the search list doesn't need full text,
      // and some assets are very long.
      body: undefined,
      snippet: r.body ? `${r.body.slice(0, 280)}${r.body.length > 280 ? "…" : ""}` : null,
    })),
  });
});
