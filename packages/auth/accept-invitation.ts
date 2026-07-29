/**
 * Shared org-invitation accept/decline — the in-app counterpart to the central
 * accept endpoint.
 *
 * WHY THIS EXISTS. Three code paths can activate an invited `OrgMember`:
 *
 *   1. `apps/auth/app/api/invitations/accept` — the emailed single-use token
 *      link. Owns the 7-day TTL, replay guard, password set and `assignAppRoles`.
 *   2. The platform auto-accept in `createAuthOptions`' `signIn` / `jwt`
 *      callbacks — fires on the invitee's first central login.
 *   3. THIS one — an already-signed-in user accepting an invitation to a
 *      SECOND org. Neither of the above covers it: the token link assumes the
 *      invitee is not yet in, and the auto-accept only runs on initial sign-in.
 *
 * Path 3 was hand-rolled per app, and the copies had already drifted. Compared
 * at extraction time, `apps/quikscale`'s version:
 *
 *   - never cleared `invitationToken`, so a leaked accept link stayed live
 *     forever after acceptance;
 *   - granted EVERY active app instead of the `inviteAppIds` the invite was
 *     issued for — a silent over-grant;
 *   - recognised only `status: "pending"`, missing the canonical `"invited"`;
 *   - wrote `status: "declined"`, which is outside the documented value space
 *     (`active` / `invited` / `inactive`).
 *
 * This module is the corrected behaviour, taken from `apps/quiklms`. Callers get
 * one implementation that cannot drift again.
 *
 * NOT a replacement for path 1. This authenticates by SESSION — the caller must
 * already have proven who they are — and the membership row is matched on
 * `userId`, so a user can only ever act on their own invitation. It deliberately
 * does not accept a raw token; that flow belongs to the central endpoint, which
 * has the TTL and replay checks.
 */
import type { PrismaClient } from "@prisma/client";

export type InvitationAction = "accept" | "decline";

export interface ResolveInvitationParams {
  membershipId: string;
  /** From the session — never from the request body. */
  userId: string;
  action: InvitationAction;
}

export interface ResolveInvitationResult {
  status: "active" | "inactive";
  orgId: string;
}

/**
 * Statuses that represent an outstanding invitation. `invited` is canonical;
 * `pending` is accepted too for rows written by older code.
 */
const OUTSTANDING = ["invited", "pending"];

/**
 * Accept or decline a pending invitation on behalf of `userId`.
 *
 * Returns `null` when there is no outstanding invitation matching
 * (membershipId, userId) — the caller should surface that as a 404. Callers
 * must NOT distinguish "not yours" from "already processed" in the response;
 * both are the same answer to the user and separating them leaks whether a
 * membership id exists.
 */
export async function resolveOrgInvitation(
  db: PrismaClient,
  { membershipId, userId, action }: ResolveInvitationParams,
): Promise<ResolveInvitationResult | null> {
  const membership = await db.orgMember.findFirst({
    where: { id: membershipId, userId, status: { in: OUTSTANDING } },
  });
  if (!membership) return null;

  if (action === "decline") {
    await db.orgMember.update({
      where: { id: membershipId },
      // `inactive`, not `declined` — the OrgMember.status value space is
      // active | invited | inactive. A declined invite is simply not a member.
      data: { status: "inactive", invitationToken: null },
    });
    return { status: "inactive", orgId: membership.orgId };
  }

  await db.orgMember.update({
    where: { id: membershipId },
    data: {
      status: "active",
      acceptedAt: new Date(),
      // Single-use: the token must not survive acceptance, or a leaked accept
      // link stays replayable for the life of the row.
      invitationToken: null,
    },
  });

  // Grant exactly the apps the invitation was issued for — not every app the
  // org happens to have. Idempotent, so a double-accept is harmless.
  if (membership.inviteAppIds?.length) {
    await db.userAppAccess.createMany({
      data: membership.inviteAppIds.map((appId) => ({
        userId,
        orgId: membership.orgId,
        appId,
        role: membership.role === "app_admin" ? "admin" : "member",
        grantedBy: membership.createdBy ?? undefined,
      })),
      skipDuplicates: true,
    });
  }

  return { status: "active", orgId: membership.orgId };
}
