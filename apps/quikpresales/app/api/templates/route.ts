import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { TEMPLATE_KINDS } from "@/lib/library/constants";
import {
  parsePaginationParams,
  paginationToSkipTake,
  buildPaginationResponse,
} from "@quikit/shared/pagination";

const withTemplateAuth = withOrgAuthForModule("library.templates");

const listQuery = z.object({
  kind: z.enum(TEMPLATE_KINDS).optional(),
  industry: z.string().max(80).optional(),
  technology: z.string().max(80).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  search: z.string().max(120).optional(),
});

const createSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  name: z.string().min(2, "Name must be at least 2 characters").max(160),
  description: z.string().max(2000).optional(),
  /**
   * Free-form. For `kind: "proposal"` this is expected to be an array of
   * `{ slug, title, html }` so it can seed a proposal skeleton — see
   * POST /api/proposals.
   */
  content: z.unknown().default({}),
  industry: z.string().max(80).optional(),
  technology: z.string().max(80).optional(),
});

const LIST_SELECT = {
  id: true,
  kind: true,
  name: true,
  description: true,
  industry: true,
  technology: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PsTemplateSelect;

/** GET /api/templates */
export const GET = withTemplateAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "templates", "view");
  if (denied) return denied;

  const parsed = listQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { kind, industry, technology, isActive, search } = parsed.data;

  const pagination = parsePaginationParams(req.nextUrl.searchParams);
  const where: Prisma.PsTemplateWhereInput = {
    orgId,
    deletedAt: null,
    ...(kind && { kind }),
    ...(industry && { industry }),
    ...(technology && { technology }),
    ...(isActive && { isActive: isActive === "true" }),
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [items, total] = await Promise.all([
    db.psTemplate.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      ...paginationToSkipTake(pagination),
    }),
    db.psTemplate.count({ where }),
  ]);

  return okSerialized(buildPaginationResponse(items, total, pagination));
});

/** POST /api/templates */
export const POST = withTemplateAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "templates", "create");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const template = await db.$transaction(async (tx) => {
    const row = await tx.psTemplate.create({
      data: {
        orgId,
        kind: parsed.data.kind,
        name: parsed.data.name,
        description: parsed.data.description,
        content: (parsed.data.content ?? {}) as Prisma.InputJsonValue,
        industry: parsed.data.industry,
        technology: parsed.data.technology,
        createdBy: userId,
        updatedBy: userId,
      },
      select: LIST_SELECT,
    });
    await writeAudit(tx, { orgId, userId, action: "template.create", resource: row.id });
    return row;
  });

  return createdSerialized(template);
});
