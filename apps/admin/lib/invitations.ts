import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export type ActivateResult =
  | { ok: true; orgId: string; role: string; userId: string }
  | { ok: false; status: number; error: string };

/** Activates an OrgMember by invitation token.
 *  Optionally sets a password (email path). OAuth path omits password.
 *  Nulls out the token so the link cannot be reused. */
export async function activateMembership(
  token: string,
  password?: string,
): Promise<ActivateResult> {
  const membership = await db.orgMember.findFirst({
    where: { invitationToken: token },
    include: { user: true },
  });

  if (!membership) {
    return { ok: false, status: 404, error: "Invitation not found or already revoked" };
  }

  if (membership.status !== "invited") {
    return { ok: false, status: 409, error: "Invitation has already been accepted" };
  }

  await db.$transaction(async (tx) => {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await tx.user.update({
        where: { id: membership.userId },
        data: { password: hash, lastSignInAt: new Date() },
      });
    }

    await tx.orgMember.update({
      where: { id: membership.id },
      data: {
        status: "active",
        acceptedAt: new Date(),
        invitationToken: null,
      },
    });
  });

  return {
    ok: true,
    orgId: membership.orgId,
    role: membership.role,
    userId: membership.userId,
  };
}
