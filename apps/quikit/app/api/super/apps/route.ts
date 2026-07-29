import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { createAppSchema } from "@/lib/schemas/superAdminSchemas";
import { logAudit } from "@/lib/auditLog";
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared/pagination";

/**
 * GET /api/super/apps — list all apps with pagination + search (super admin only)
 */
export const GET = withSuperAdminAuth(async (auth, request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const pagination = parsePaginationParams(searchParams);
    const search = searchParams.get("search") || "";

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [apps, total] = await Promise.all([
      db.app.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          baseUrl: true,
          status: true,
          createdAt: true,
          oauthClient: { select: { clientId: true } },
        },
        orderBy: { name: "asc" },
        ...paginationToSkipTake(pagination),
      }),
      db.app.count({ where }),
    ]);

    const data = apps.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      description: a.description,
      baseUrl: a.baseUrl,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      hasOAuthClient: !!a.oauthClient,
    }));

    return NextResponse.json({ success: true, ...buildPaginationResponse(data, total, pagination) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * POST /api/super/apps — register a new app (super admin only)
 */
export const POST = withSuperAdminAuth(async (auth, request: NextRequest) => {
  try {
    const body = await request.json();
    const parsed = createAppSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { name, slug, description, baseUrl, status } = parsed.data;

    // Check slug uniqueness
    const existing = await db.app.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "An app with this slug already exists" },
        { status: 409 },
      );
    }

    const app = await db.app.create({
      data: { name, slug, description, baseUrl, status },
    });

    logAudit({
      action: "create",
      entityType: "app",
      entityId: app.id,
      actorId: auth.userId,
      newValues: JSON.stringify({ name, slug, status }),
    });

    return NextResponse.json({ success: true, data: app }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
