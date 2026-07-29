/**
 * SA-B.6 — Dismiss a broadcast for the current user.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Upsert to ensure idempotency — a double-click shouldn't error.
    await db.broadcastDismissal.upsert({
      where: { announcementId_userId: { announcementId: params.id, userId: session.user.id } },
      update: {},
      create: { announcementId: params.id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to dismiss";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
