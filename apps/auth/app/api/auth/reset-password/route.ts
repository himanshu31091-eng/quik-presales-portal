import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { consumeResetToken } from "@/lib/otp-store";
import { withCors, preflight } from "@/lib/cors";

/**
 * POST /api/auth/reset-password
 *
 * Body: { resetToken, password }
 *
 * The resetToken is the one-shot key minted by `POST /api/auth/verify-otp`
 * after a successful 6-digit OTP confirmation. We look up the userId out of
 * the OTP store (atomic single-use), bcrypt-hash the new password with cost
 * factor 12, and write `User.password`.
 *
 * Top-level try/catch ensures any unexpected throw — Redis blip, Prisma
 * client mismatch, etc. — surfaces as a JSON response the frontend can
 * parse, never as Next.js's default HTML 500. The actual error is logged
 * server-side for debugging.
 */

const Body = z.object({
  resetToken: z.string().min(20),
  password: z.string().min(8).max(200),
});

async function postHandler(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid input" },
        { status: 400 },
      );
    }
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid input" },
        { status: 400 },
      );
    }

    const userId = await consumeResetToken(parsed.data.resetToken);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Reset link expired. Please request a new code." },
        { status: 400 },
      );
    }

    const hashed = await bcrypt.hash(parsed.data.password, 12);

    await db.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // Always log the underlying error so the dev console shows the actual
    // failure (Prisma P2025, Redis ECONNREFUSED, bcrypt issue, …) instead
    // of leaving the developer staring at a blank 500.
    console.error("[reset-password] failed:", error);
    const isDev = process.env.NODE_ENV !== "production";
    const message =
      isDev && error instanceof Error
        ? error.message
        : "Could not update password. Please try again.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export const POST = withCors(postHandler);
export function OPTIONS(req: NextRequest) {
  return preflight(req);
}
