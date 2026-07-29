import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyJWT } from "@quikit/auth/jwt";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * FRD FR-SA-009 / FR-SA-010 / BR-008 — Set Password API.
 *
 * Used by the /set-password screen, which is shown ONCE after first login
 * for users created via the native invite flow. Always expects:
 *
 *   { currentPassword, newPassword, confirmPassword }
 *
 * The legacy `{ skip: true }` branch (which let users keep the temporary
 * password) was removed when temp passwords became unique per-invite — a
 * generated one-time password must never be kept as the user's standing
 * credential.
 */
export async function POST(req: NextRequest) {
  const token = await verifyJWT(req);
  const userId = token ? ((token.sub ?? token.id) as string | undefined) : undefined;
  if (!token || !userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Body must be JSON" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const { currentPassword, newPassword, confirmPassword } = body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json(
      { success: false, error: "All password fields are required." },
      { status: 400 }
    );
  }

  if (newPassword !== confirmPassword) {
    // FRD §7 — exact wording.
    return NextResponse.json(
      { success: false, error: "Passwords do not match. Please re-enter." },
      { status: 400 }
    );
  }

  // BRV-008 — current password must match the user's actual stored password.
  if (!user.password) {
    return NextResponse.json(
      { success: false, error: "Account has no password set. Use Forgot Password." },
      { status: 400 }
    );
  }
  const okCurrent = await bcrypt.compare(currentPassword, user.password);
  if (!okCurrent) {
    return NextResponse.json(
      { success: false, error: "Incorrect password. Please enter your current password to proceed." },
      { status: 400 }
    );
  }

  // BRV-006 — password policy: ≥8 chars, 1 uppercase, 1 number, 1 special.
  const policyError = checkPasswordPolicy(newPassword);
  if (policyError) {
    return NextResponse.json({ success: false, error: policyError }, { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false },
  });

  return NextResponse.json({ success: true });
}

function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain at least one special character.";
  return null;
}
