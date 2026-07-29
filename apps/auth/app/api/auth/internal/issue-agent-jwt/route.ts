/**
 * POST /api/auth/internal/issue-agent-jwt
 *
 * Mints a short-lived JWT that lets a trusted internal service (the AI
 * Runtime, Search, Comms, Launcher) call user-scoped APIs on behalf of a
 * user. The minted token has the same shape as a normal session JWT so any
 * `withAuth`-protected route accepts it transparently — plus two extra
 * claims (`actingAs`, `actingAgentId`) that audit log code reads to record
 * the actor type.
 *
 * Security model:
 *   - Gated by `x-internal-secret` (same secret that gates `/api/verify-token`).
 *   - `requestingService` must be on the allowlist in @quikit/shared.
 *   - `(userId, orgId)` must be an active OrgMember row — the endpoint
 *     refuses to mint a token for a relationship that doesn't exist.
 *   - TTL is bounded [60, 900] seconds. No `sessionId` claim is set, so the
 *     token does NOT participate in the Redis session store (it cannot be
 *     revoked mid-flight; rely on the short TTL instead).
 *   - Every attempt — success or failure — writes one row to
 *     `auth.AgentJwtIssuance` so we have an audit trail of who minted what.
 *
 * See docs/12-auth-service-integration-response.md for the full contract.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAllowedInternalService } from "@quikit/shared";

const TTL_MIN_SECONDS = 60;
const TTL_MAX_SECONDS = 900;
const TTL_DEFAULT_SECONDS = 300;

const ACTING_AS_VALUES = ["user", "ai_agent", "platform_service", "scheduled_job"] as const;

const BodySchema = z.object({
  userId: z.string().min(1),
  orgId: z.string().min(1),
  ttlSeconds: z
    .number()
    .int()
    .min(TTL_MIN_SECONDS)
    .max(TTL_MAX_SECONDS)
    .default(TTL_DEFAULT_SECONDS),
  requestingService: z.string().min(1),
  reason: z.string().min(1).max(500),
  actingAs: z.enum(ACTING_AS_VALUES).default("user"),
  actingAgentId: z.string().min(1).max(200).optional(),
});

type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  traceId: string | null,
) {
  return NextResponse.json(
    { error: { code, message, traceId } },
    { status },
  );
}

function statusFromCode(code: ErrorCode): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "unauthorized";
    case "FORBIDDEN":
      return "forbidden";
    case "NOT_FOUND":
      return "not_found";
    case "VALIDATION_ERROR":
      return "validation_error";
    case "INTERNAL_ERROR":
      return "internal_error";
  }
}

/**
 * Best-effort audit. Swallowed on failure (an audit-table outage must not
 * break agent JWT issuance — the network call is more important than the
 * audit row, and we still have request logs as a fallback).
 */
async function recordIssuance(args: {
  requestingService: string;
  userId: string;
  orgId: string;
  agentId: string | null;
  reason: string;
  ttlSeconds: number;
  actingAs: string;
  traceId: string | null;
  status: string;
  errorCode: ErrorCode | null;
}): Promise<void> {
  try {
    await db.agentJwtIssuance.create({
      data: {
        requestingService: args.requestingService,
        userId: args.userId,
        orgId: args.orgId,
        agentId: args.agentId,
        reason: args.reason,
        ttlSeconds: args.ttlSeconds,
        actingAs: args.actingAs,
        traceId: args.traceId,
        status: args.status,
        errorCode: args.errorCode,
      },
    });
  } catch {
    // Intentionally silent — see jsdoc above.
  }
}

export async function POST(req: NextRequest) {
  const traceId = req.headers.get("x-trace-id");

  // ── Auth: shared internal secret ──────────────────────────────────────
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    // No body audit row here — we don't trust the body yet (could be junk).
    return errorResponse(401, "UNAUTHORIZED", "Forbidden", traceId);
  }

  // ── Parse + validate body ─────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(422, "VALIDATION_ERROR", "Body must be JSON", traceId);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      422,
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      traceId,
    );
  }
  const body = parsed.data;

  // Cross-field constraint: actingAgentId is required iff actingAs="ai_agent"
  if (body.actingAs === "ai_agent" && !body.actingAgentId) {
    await recordIssuance({
      requestingService: body.requestingService,
      userId: body.userId,
      orgId: body.orgId,
      agentId: null,
      reason: body.reason,
      ttlSeconds: body.ttlSeconds,
      actingAs: body.actingAs,
      traceId,
      status: statusFromCode("VALIDATION_ERROR"),
      errorCode: "VALIDATION_ERROR",
    });
    return errorResponse(
      422,
      "VALIDATION_ERROR",
      "actingAgentId required when actingAs='ai_agent'",
      traceId,
    );
  }

  const auditBase = {
    requestingService: body.requestingService,
    userId: body.userId,
    orgId: body.orgId,
    agentId: body.actingAgentId ?? null,
    reason: body.reason,
    ttlSeconds: body.ttlSeconds,
    actingAs: body.actingAs,
    traceId,
  };

  // ── Service allowlist ─────────────────────────────────────────────────
  if (!isAllowedInternalService(body.requestingService)) {
    await recordIssuance({
      ...auditBase,
      status: statusFromCode("FORBIDDEN"),
      errorCode: "FORBIDDEN",
    });
    return errorResponse(
      403,
      "FORBIDDEN",
      `Service '${body.requestingService}' is not on the internal allowlist`,
      traceId,
    );
  }

  // ── Membership check ──────────────────────────────────────────────────
  const membership = await db.orgMember.findFirst({
    where: { userId: body.userId, orgId: body.orgId, status: "active" },
    select: { role: true },
  });
  if (!membership) {
    await recordIssuance({
      ...auditBase,
      status: statusFromCode("NOT_FOUND"),
      errorCode: "NOT_FOUND",
    });
    return errorResponse(
      404,
      "NOT_FOUND",
      "No active membership for (userId, orgId)",
      traceId,
    );
  }

  // ── Mint the JWT ──────────────────────────────────────────────────────
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    await recordIssuance({
      ...auditBase,
      status: statusFromCode("INTERNAL_ERROR"),
      errorCode: "INTERNAL_ERROR",
    });
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Server missing NEXTAUTH_SECRET",
      traceId,
    );
  }

  const user = await db.user.findUnique({
    where: { id: body.userId },
    select: { id: true, email: true, isSuperAdmin: true },
  });
  if (!user) {
    // Race: membership existed but user got deleted between queries.
    await recordIssuance({
      ...auditBase,
      status: statusFromCode("NOT_FOUND"),
      errorCode: "NOT_FOUND",
    });
    return errorResponse(404, "NOT_FOUND", "User not found", traceId);
  }

  const jwtPayload = {
    id: user.id,
    email: user.email,
    orgId: body.orgId,
    membershipRole: membership.role,
    isSuperAdmin: user.isSuperAdmin,
    actingAs: body.actingAs,
    ...(body.actingAgentId ? { actingAgentId: body.actingAgentId } : {}),
  };

  let token: string;
  try {
    token = await encode({
      token: jwtPayload,
      secret: nextAuthSecret,
      maxAge: body.ttlSeconds,
    });
  } catch (err: unknown) {
    await recordIssuance({
      ...auditBase,
      status: statusFromCode("INTERNAL_ERROR"),
      errorCode: "INTERNAL_ERROR",
    });
    const message = err instanceof Error ? err.message : "JWT signing failed";
    return errorResponse(500, "INTERNAL_ERROR", message, traceId);
  }

  const expiresAt = new Date(Date.now() + body.ttlSeconds * 1000).toISOString();

  await recordIssuance({
    ...auditBase,
    status: "success",
    errorCode: null,
  });

  return NextResponse.json({ token, expiresAt }, { status: 200 });
}
