/**
 * Email helpers for the central auth service. Two transports, picked at
 * runtime in this order:
 *
 *   1. SMTP via nodemailer — if `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` are set.
 *      Same env-var shape as `apps/quikit/lib/email.ts` so a single Office365
 *      / Gmail / Mailgun setup serves both apps.
 *   2. Resend — if `RESEND_API_KEY` is set and the optional `resend` package
 *      resolves at runtime.
 *   3. No-op + console.log — for local dev with no email infra at all. The
 *      OTP / verification link is printed so you can copy it from the server
 *      logs.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { requireProdEnv } from "@quikit/shared";

let _smtpTransporter: Transporter | null = null;
let _smtpResolved = false;

let _resendCtor: typeof import("resend").Resend | null = null;
try {
  // Optional dependency. require() is wrapped so a missing install just
  // turns the Resend path off — no crash at import time.
  _resendCtor = require("resend").Resend;
} catch {
  _resendCtor = null;
}

function getSmtpTransporter(): Transporter | null {
  if (_smtpResolved) return _smtpTransporter;
  _smtpResolved = true;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) return null;

  _smtpTransporter = nodemailer.createTransport({
    host,
    port: port ? parseInt(port, 10) : 587,
    secure: false,
    auth: { user, pass },
    tls: { ciphers: "SSLv3" },
  });
  return _smtpTransporter;
}

function getResendClient() {
  if (!_resendCtor || !process.env.RESEND_API_KEY) return null;
  return new _resendCtor(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  const from =
    process.env.SMTP_FROM ||
    process.env.EMAIL_USER ||
    process.env.SMTP_USER;
  return from ? `QuikIT <${from}>` : "QuikIT <noreply@quikit.app>";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function authBase(): string {
  // Env-only: `NEXT_PUBLIC_AUTH_URL` must be set in prod (throws otherwise),
  // dev falls back to the local auth host port.
  return requireProdEnv("NEXT_PUBLIC_AUTH_URL", "http://localhost:3000");
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send via the first transport that's configured. If none are configured,
 * log a one-line trace and return — never throws on the no-transport path
 * because email failures must not block the auth flow.
 */
async function deliver(args: SendArgs, devTrace: () => void): Promise<void> {
  const smtp = getSmtpTransporter();
  if (smtp) {
    await smtp.sendMail({
      from: fromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
    return;
  }

  const resend = getResendClient();
  if (resend) {
    await resend.emails.send({
      from: fromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
    return;
  }

  devTrace();
}

export async function sendVerificationEmail(params: {
  to: string;
  token: string;
}): Promise<void> {
  const link = `${authBase()}/verify-email?token=${encodeURIComponent(params.token)}`;
  await deliver(
    {
      to: params.to,
      subject: "Verify your QuikIT email",
      html: `<p>Confirm your email to activate your QuikIT account.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
    },
    () => console.log("[auth-email] verify-email link for", params.to, "→", link),
  );
}

export async function sendPasswordResetOtpEmail(params: {
  to: string;
  otp: string;
}): Promise<void> {
  const safeOtp = esc(params.otp);
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.07);">
      <div style="background:#4f46e5;padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">QuikIT</h1>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:600;">Reset your password</h2>
        <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
          We received a request to reset your QuikIT password. Enter the code below to continue.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:24px;text-align:center;margin:20px 0;">
          <p style="margin:0 0 12px;color:#64748b;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Your verification code</p>
          <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#0f172a;font-size:34px;font-weight:600;letter-spacing:8px;">${safeOtp}</p>
          <p style="margin:14px 0 0;color:#94a3b8;font-size:12px;">This code expires in 3 minutes.</p>
        </div>
        <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">
          If you didn't request this, you can ignore this email — your password stays the same.
        </p>
      </div>
      <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">Never share this code with anyone. QuikIT staff will never ask for it.</p>
      </div>
    </div>
  </body>
</html>`;

  await deliver(
    {
      to: params.to,
      subject: "Your QuikIT password reset code",
      html,
    },
    () => console.log("[auth-email] password-reset OTP for", params.to, "→", params.otp),
  );
}

/**
 * Self-serve registration: the user submitted the "Create your workspace"
 * form. We email a 6-digit code (5-minute expiry) they enter on the OTP step
 * to prove email ownership before setting a password. Mirrors the password-
 * reset OTP email styling.
 */
export async function sendRegistrationOtpEmail(params: {
  to: string;
  otp: string;
}): Promise<void> {
  const safeOtp = esc(params.otp);
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.07);">
      <div style="background:#4f46e5;padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">QuikIT</h1>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:600;">Confirm your email</h2>
        <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
          Welcome to QuikIT! Enter the code below to verify your email and finish setting up your workspace.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:24px;text-align:center;margin:20px 0;">
          <p style="margin:0 0 12px;color:#64748b;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Your verification code</p>
          <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#0f172a;font-size:34px;font-weight:600;letter-spacing:8px;">${safeOtp}</p>
          <p style="margin:14px 0 0;color:#94a3b8;font-size:12px;">This code expires in 5 minutes.</p>
        </div>
        <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">
          If you didn't try to create a QuikIT workspace, you can safely ignore this email.
        </p>
      </div>
      <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">Never share this code with anyone. QuikIT staff will never ask for it.</p>
      </div>
    </div>
  </body>
</html>`;

  await deliver(
    {
      to: params.to,
      subject: "Your QuikIT verification code",
      html,
    },
    () => console.log("[auth-email] registration OTP for", params.to, "→", params.otp),
  );
}

/**
 * Password-reset invite: the user has clicked "Send code" on the marketing
 * Reset-password screen, we've reset their password back to the system
 * default and minted a fresh single-use OrgMember.invitationToken. This
 * email gives them the default credentials + a link that opens the
 * Set-Password screen (the same one used for first-time native invites).
 */
export async function sendPasswordResetInviteEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  await deliver(
    { to: params.to, subject: params.subject, html: params.html },
    () =>
      console.log(
        "[auth-email] password-reset invite for",
        params.to,
        "— SMTP/Resend not configured; check the OrgMember.invitationToken to construct the link manually",
      ),
  );
}

export async function sendInviteAcceptEmail(params: {
  to: string;
  orgName: string;
  token: string;
}): Promise<void> {
  const link = `${authBase()}/signup?invite=${encodeURIComponent(params.token)}`;
  await deliver(
    {
      to: params.to,
      subject: `You've been invited to ${params.orgName} on QuikIT`,
      html: `<p>Accept the invite and set your password to join <strong>${esc(params.orgName)}</strong>.</p><p><a href="${link}">Accept invite</a></p>`,
    },
    () => console.log("[auth-email] invite link for", params.to, "→", link),
  );
}
