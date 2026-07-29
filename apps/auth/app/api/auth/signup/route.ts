import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { generateToken, hashToken } from "@/lib/tokens";

const Body = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  invite: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }
    const { firstName, lastName, email, password, invite } = parsed.data;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    let emailVerified: Date | null = null;
    let orgInviteConsumed: { orgId: string; role: string } | null = null;

    if (invite) {
      const inviteHash = hashToken(invite);
      const tokenRow = await db.verificationToken.findFirst({
        where: { tokenHash: inviteHash, type: "org_invite", usedAt: null, expiresAt: { gt: new Date() } },
      });
      const membership = await db.orgMember.findFirst({
        where: { invitationToken: invite, acceptedAt: null, status: "active" },
      });
      if (tokenRow || membership) {
        emailVerified = new Date();
        if (membership) {
          orgInviteConsumed = { orgId: membership.orgId, role: membership.role };
        }
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: hashed,
        emailVerified,
      },
    });

    if (orgInviteConsumed) {
      await db.orgMember.updateMany({
        where: { orgId: orgInviteConsumed.orgId, invitationToken: invite! },
        data: { userId: user.id, acceptedAt: new Date(), invitationToken: null },
      });
    }

    if (!emailVerified) {
      const { token, hash } = generateToken();
      await db.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          type: "email_verify",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      try {
        await sendVerificationEmail({ to: email, token });
      } catch (err) {
        console.error("[signup] verify email send failed:", err);
      }
    }

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Signup failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
