import nodemailer, { type Transporter } from "nodemailer";
import { requireProdEnv } from "@quikit/shared/env";
import {
  renderInvitationEmail,
  sendWithRetry,
  type InviteMethod,
  type SsoProvider,
} from "@quikit/shared";

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) return null;

  _transporter = nodemailer.createTransport({
    host,
    port: port ? parseInt(port, 10) : 587,
    secure: false,
    auth: { user, pass },
    tls: { ciphers: "SSLv3" },
  });

  return _transporter;
}

function fromAddress(): string {
  const from = process.env.SMTP_FROM || process.env.EMAIL_USER || process.env.SMTP_USER;
  return from ? `QuikIT <${from}>` : "QuikIT <noreply@quikit.app>";
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseUrl(): string {
  return requireProdEnv("NEXTAUTH_URL", "http://localhost:3000"); // prod-safety-allow: dev fallback, prod throws
}

/**
 * Login lives on the central auth app (NEXT_PUBLIC_AUTH_URL), not on this
 * launcher. Fall back to NEXTAUTH_URL only if AUTH_URL isn't set.
 */
function getLoginUrl(): string {
  const authBase =
    process.env.NEXT_PUBLIC_AUTH_URL ||
    requireProdEnv("NEXTAUTH_URL", "http://localhost:3000"); // prod-safety-allow: dev fallback, prod throws
  return `${authBase}/login`;
}

export async function sendMemberAddedEmail(params: {
  to: string;
  orgName: string;
  role: string;
  /** Set only when a new user was created via Native — render a credentials block. */
  tempPassword?: string;
  /** "sso" | "native". When "sso", render a provider CTA instead of credentials. */
  inviteMethod?: string;
  /** "google" | "microsoft" — used to label the SSO sign-in CTA. */
  ssoProvider?: string | null;
}): Promise<void> {
  const transporter = getTransporter();
  const loginUrl = getLoginUrl();
  const safeOrg = esc(params.orgName);
  const safeRole = esc(params.role);
  const safeEmail = esc(params.to);

  const isSso = params.inviteMethod === "sso";
  const providerLabel =
    params.ssoProvider === "google"
      ? "Google"
      : params.ssoProvider === "microsoft"
        ? "Microsoft"
        : null;

  const credentialsBlock = params.tempPassword
    ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 12px;color:#0f172a;font-size:13px;font-weight:600;">Your sign-in details</p>
        <table style="width:100%;font-size:14px;color:#0f172a;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#64748b;width:120px;">Email</td><td style="padding:4px 0;font-family:ui-monospace,monospace;">${safeEmail}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">Temporary password</td><td style="padding:4px 0;font-family:ui-monospace,monospace;">${esc(params.tempPassword)}</td></tr>
        </table>
        <p style="margin:12px 0 0;color:#94a3b8;font-size:12px;">Please change this password after your first sign-in.</p>
      </div>`
    : isSso
      ? `<p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">Sign in with <strong>${providerLabel ?? "your single sign-on provider"}</strong> to access this organization — no password required.</p>`
      : `<p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">Sign in with your existing QuikIT credentials to access this organization.</p>`;

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.07);">
      <div style="background:#4f46e5;padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">QuikIT</h1>
      </div>
      <div style="padding:32px;">
        <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;font-weight:600;">Welcome to ${safeOrg}</h2>
        <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
          You've been added to <strong>${safeOrg}</strong> as a <strong>${safeRole}</strong> on QuikIT.
        </p>
        ${credentialsBlock}
        <a href="${loginUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Sign in to QuikIT</a>
        <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">
          If the button doesn't work, copy this link into your browser:<br>
          <a href="${loginUrl}" style="color:#4f46e5;word-break:break-all;">${loginUrl}</a>
        </p>
      </div>
      <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">You're receiving this because a QuikIT admin added you to ${safeOrg}. If you didn't expect this, you can ignore this email.</p>
      </div>
    </div>
  </body>
</html>`;

  if (!transporter) {
    console.log(
      "[email] SMTP not configured — would send member-added to",
      params.to,
      params.tempPassword ? "(with temp password)" : "(existing user)"
    );
    return;
  }

  await transporter.sendMail({
    from: fromAddress(),
    to: params.to,
    subject: `You've been added to ${params.orgName}`,
    html,
  });
}

export async function sendUserCreatedEmail(params: {
  to: string;
  firstName: string;
}): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[email] SMTP not configured — would send welcome to", params.to);
    return;
  }
  await transporter.sendMail({
    from: fromAddress(),
    to: params.to,
    subject: "Welcome to QuikIT",
    html: `<p>Hi ${esc(params.firstName)},</p><p>Your QuikIT account has been created.</p><p><a href="${getLoginUrl()}">Sign in</a></p>`,
  });
}

/**
 * FRD §4 — sends the SSO or Native invitation email for the Superadmin org
 * onboarding flow. The Quikit launcher uses SMTP (nodemailer); apps/admin
 * uses Resend. Both render the same template via @quikit/shared.
 */
export async function sendOnboardingInvitationEmail(params: {
  to: string;
  firstName: string;
  orgName: string;
  orgLogoUrl?: string | null;
  orgBrandColor?: string | null;
  inviterName: string;
  role: string;
  appNames: string[];
  token: string;
  inviteMethod: InviteMethod;
  ssoProvider?: SsoProvider | null;
  isReminder?: boolean;
  /** Override the temp-password shown in the email (reset flow only). */
  tempPassword?: string;
}): Promise<{ success: boolean; attempts: number; error?: unknown }> {
  const transporter = getTransporter();
  // Invitation links land users on the QuikIT launcher (this app). Its
  // marketing landing renders a LoginModal that auto-opens whenever the
  // request URL carries `?next=`, which is exactly what the middleware
  // appends when an unauthenticated visitor hits /invitations/accept.
  // We deliberately do NOT use NEXT_PUBLIC_AUTH_URL here — that points at
  // the central credentials host (:3000 in dev) which serves its own
  // dark-theme Set-Password page instead of the launcher's modal.
  const authBase =
    process.env.QUIKIT_URL ||
    process.env.NEXT_PUBLIC_QUIKIT_URL ||
    requireProdEnv("NEXTAUTH_URL", "http://localhost:3001"); // prod-safety-allow: dev fallback, prod throws

  const { subject, html } = renderInvitationEmail({
    ...params,
    appBaseUrl: authBase,
  });

  if (!transporter) {
    console.log(
      "[email] SMTP not configured — would send onboarding invite to",
      params.to,
      `(method=${params.inviteMethod}${params.ssoProvider ? `/${params.ssoProvider}` : ""})`
    );
    // Return a synthetic success so callers don't see a "delivery failed"
    // warning in dev when SMTP is intentionally unset.
    return { success: true, attempts: 0 };
  }

  // FRD §7 — 3 attempts with linear back-off; nodemailer throws on failure
  // and resolves on success, which sendWithRetry normalises.
  const result = await sendWithRetry(
    () =>
      transporter.sendMail({
        from: fromAddress(),
        to: params.to,
        subject,
        html,
      }),
    { label: `onboarding-invite[${params.to}]`, attempts: 3 }
  );
  return { success: result.success, attempts: result.attempts, error: result.error };
}

export async function sendOrgSuspendedEmail(params: {
  to: string;
  orgName: string;
}): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[email] SMTP not configured — would send org-suspended to", params.to);
    return;
  }
  await transporter.sendMail({
    from: fromAddress(),
    to: params.to,
    subject: `${params.orgName} has been suspended`,
    html: `<p>The organization <strong>${esc(params.orgName)}</strong> has been suspended on QuikIT. Contact support for more information.</p>`,
  });
}

/**
 * SA-Tech-Debt-3 — send a platform alert notification to super admins.
 *
 * Called from the alerts engine cron when a new critical or warning alert is
 * raised (first-fire) or when an alert escalates from warning to critical.
 * Never sent on refresh — that would flood the inbox.
 */
export async function sendPlatformAlertEmail(params: {
  to: string[];
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  link?: string | null;
}): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[email] SMTP not configured — would send platform alert:", params.title, "to", params.to.join(", "));
    return;
  }
  const severityColor = params.severity === "critical" ? "#dc2626" : params.severity === "warning" ? "#d97706" : "#2563eb";
  const linkHtml = params.link ? `<p><a href="${baseUrl()}${esc(params.link)}" style="color:#4f46e5">Open in QuikIT →</a></p>` : "";
  try {
    await transporter.sendMail({
      from: fromAddress(),
      to: params.to.join(","),
      subject: `[${params.severity.toUpperCase()}] ${params.title}`,
      html: `
        <div style="font-family:ui-sans-serif,system-ui;max-width:560px">
          <p style="color:${severityColor};text-transform:uppercase;font-size:12px;letter-spacing:1px;font-weight:600">
            Platform ${esc(params.severity)}
          </p>
          <h2 style="margin:8px 0 0 0">${esc(params.title)}</h2>
          <p style="margin-top:8px;color:#374151">${esc(params.message)}</p>
          ${linkHtml}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
          <p style="color:#6b7280;font-size:12px">
            This is an automated alert from the QuikIT platform. You're
            receiving it because you're listed as a super admin.
          </p>
        </div>`,
    });
  } catch (err) {
    console.error("[email] Failed to send platform alert:", err);
  }
}
