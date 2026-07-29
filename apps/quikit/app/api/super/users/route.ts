import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { createUserSchema } from "@/lib/schemas/superAdminSchemas";
import { logAudit } from "@/lib/auditLog";
import { sendUserCreatedEmail } from "@/lib/email";
import { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "@quikit/shared/pagination";

/**
 * GET /api/super/users — list all users with pagination + search (super admin only)
 */
export const GET = withSuperAdminAuth(async (_auth, request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const pagination = parsePaginationParams(searchParams);
    const search = searchParams.get("search") || "";
    const orgId = searchParams.get("orgId") || "";

    // Build filter clauses
    const clauses: Record<string, unknown>[] = [];
    if (search) {
      clauses.push({
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      });
    }
    if (orgId) {
      // Only users that are members of this tenant
      clauses.push({ memberships: { some: { orgId, status: "active" } } });
    }
    const where = clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { AND: clauses };

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isSuperAdmin: true,
          lastSignInAt: true,
          _count: { select: { memberships: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginationToSkipTake(pagination),
      }),
      db.user.count({ where }),
    ]);

    const data = users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      isSuperAdmin: u.isSuperAdmin,
      lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
      membershipCount: u._count.memberships,
    }));

    return NextResponse.json({ success: true, ...buildPaginationResponse(data, total, pagination) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * POST /api/super/users — create a new platform user (super admin only)
 */
export const POST = withSuperAdminAuth(async ({ userId }, request: NextRequest) => {
  try {
    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { email, firstName, lastName, password, isSuperAdmin } = parsed.data;

    // Check email uniqueness
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A user with this email already exists" },
        { status: 409 },
      );
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: { email, firstName, lastName, password: hashed, isSuperAdmin },
    });

    logAudit({
      action: "create",
      entityType: "user",
      entityId: user.id,
      actorId: userId,
      newValues: JSON.stringify({ email, firstName, lastName, isSuperAdmin }),
    });

    // Fire-and-forget email notification
    sendUserCreatedEmail({ to: email, firstName }).catch((err) =>
      console.error("[email] Failed to send user created email:", email, err)
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isSuperAdmin: user.isSuperAdmin,
          createdAt: user.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
