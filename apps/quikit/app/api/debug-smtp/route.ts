/**
 * TEMPORARY DEBUG ROUTE — remove after diagnosing the Vercel SMTP send issue.
 *
 * Calls nodemailer.verify() then attempts a real send, and returns the
 * full error shape (code, responseCode, response, command) in the HTTP
 * response so we can see what Office365 actually says. Locked behind
 * INTERNAL_SECRET so it can't be hit anonymously.
 *
 * Usage:
 *   GET /api/_debug-smtp?token=<INTERNAL_SECRET>&to=you@example.com
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token || token !== process.env.INTERNAL_SECRET) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const to = searchParams.get("to") || process.env.SMTP_USER || "support@quikit.ai";

  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const passRaw = process.env.SMTP_PASS;
  const passLen = passRaw?.length ?? 0;
  const passFirst = passRaw ? `${passRaw[0]}…${passRaw[passRaw.length - 1]}` : null;

  const config = {
    host: host ?? null,
    port: portStr ?? null,
    user: user ?? null,
    hasPass: !!passRaw,
    passLen,
    passHint: passFirst,
    from: process.env.SMTP_FROM ?? null,
  };

  if (!host || !user || !passRaw) {
    return NextResponse.json({ success: false, stage: "config-missing", config });
  }

  let transporter: nodemailer.Transporter;
  try {
    transporter = nodemailer.createTransport({
      host,
      port: portStr ? parseInt(portStr, 10) : 587,
      secure: false,
      requireTLS: true,
      auth: { user, pass: passRaw },
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      stage: "createTransport",
      error: err instanceof Error ? err.message : String(err),
      config,
    });
  }

  let verifyOk = false;
  let verifyError: Record<string, unknown> | null = null;
  try {
    await transporter.verify();
    verifyOk = true;
  } catch (err: unknown) {
    const e = err as {
      message?: string;
      code?: string;
      response?: string;
      responseCode?: number;
      command?: string;
    };
    verifyError = {
      message: e.message || String(err),
      code: e.code ?? null,
      responseCode: e.responseCode ?? null,
      response: e.response ?? null,
      command: e.command ?? null,
    };
    return NextResponse.json({
      success: false,
      stage: "verify",
      verifyOk,
      verifyError,
      config,
    });
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to,
      subject: "[Debug] SMTP test from Vercel launcher",
      text: `This is a test email sent from quikit-launcher on Vercel.\n\nTimestamp: ${new Date().toISOString()}\n\nIf you received this, SMTP works.`,
    });

    return NextResponse.json({
      success: true,
      stage: "sent",
      messageId: info.messageId,
      response: info.response,
      envelope: info.envelope,
      accepted: info.accepted,
      rejected: info.rejected,
      verifyOk,
      config,
    });
  } catch (err: unknown) {
    const e = err as {
      message?: string;
      code?: string;
      response?: string;
      responseCode?: number;
      command?: string;
    };
    return NextResponse.json({
      success: false,
      stage: "send",
      verifyOk,
      error: e.message || String(err),
      code: e.code ?? null,
      responseCode: e.responseCode ?? null,
      response: e.response ?? null,
      command: e.command ?? null,
      config,
    });
  }
}
