/**
 * FRD §4 — onboarding email content renderer.
 *
 * Pure template module: takes an invite payload, returns `{ subject, html }`.
 * Apps wire their own transport (Resend / SMTP / etc.) and pass the rendered
 * subject + HTML through. This keeps FRD BR-007 ("email provider changes
 * should not require code changes") true — provider swaps stay in app-level
 * email modules; the template stays here.
 *
 * Two flows:
 *  - SSO Invitation (FRD §4.1) — provider-specific CTA, no credentials.
 *  - Native Email Invitation (FRD §4.2) — credentials + Set-Password link.
 */

import { INVITE_METHOD, SSO_PROVIDER } from "./constants";
import type { InviteMethod, SsoProvider } from "./constants";

export interface RenderInvitationParams {
  to: string;
  firstName: string;
  orgName: string;
  orgLogoUrl?: string | null;
  orgBrandColor?: string | null;
  inviterName: string;
  /** Display label e.g. "Org Admin" / "App Admin" / "User". */
  role: string;
  appNames: string[];
  /** Single-use invitation token (used for the accept URL). */
  token: string;
  /** Base URL of the app that hosts /login and /invitations/accept. */
  appBaseUrl: string;
  inviteMethod: InviteMethod;
  ssoProvider?: SsoProvider | null;
  /** When true, subject + heading say "Reminder" instead of first-time wording. */
  isReminder?: boolean;
  /**
   * Plaintext temporary password generated via `generateTempPassword()`.
   * Required for new-user native invites + self-service resets — the
   * "Your sign-in details" block in the email renders this verbatim.
   * Omit for reminder emails to existing users + SSO invites where no
   * password is being issued; the credentials block is suppressed when
   * this field is absent so reminders don't leak a stale fallback.
   */
  tempPassword?: string;
}

const SAFE_HEX = /^#[0-9a-fA-F]{6}$/;
const SAFE_LOGO_URL = /^https:\/\/[a-zA-Z0-9._\-/]+\.(png|jpg|jpeg|svg|gif|webp)$/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appListHtml(appNames: string[]): string {
  if (appNames.length === 0) {
    return `<p style="margin:0 0 16px;color:#64748b;font-size:14px;">App access will be assigned after sign-in.</p>`;
  }
  const items = appNames
    .map((n) => `<li style="margin:0 0 4px;color:#0f172a;font-size:14px;">${escapeHtml(n)}</li>`)
    .join("");
  return `<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`;
}

export function renderInvitationEmail(params: RenderInvitationParams): { subject: string; html: string } {
  const {
    to,
    firstName,
    orgName,
    orgLogoUrl,
    orgBrandColor,
    inviterName,
    role,
    appNames,
    token,
    appBaseUrl,
    inviteMethod,
    ssoProvider,
    isReminder,
    tempPassword,
  } = params;
  const displayPassword = tempPassword;

  const safeOrg = escapeHtml(orgName);
  const safeFirst = escapeHtml(firstName);
  const safeInviter = escapeHtml(inviterName);
  const safeRole = escapeHtml(role);
  const accent = orgBrandColor && SAFE_HEX.test(orgBrandColor) ? orgBrandColor : "#6366f1";
  const headerInner =
    orgLogoUrl && SAFE_LOGO_URL.test(orgLogoUrl)
      ? `<img src="${orgLogoUrl}" alt="${safeOrg}" style="max-height:32px;display:block;" />`
      : `<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${safeOrg}</h1>`;

  const loginUrl = `${appBaseUrl}/login`;
  const acceptUrl = `${appBaseUrl}/invitations/accept?token=${token}`;

  // ── SSO branch (FRD §4.1) ───────────────────────────────────────────────
  if (inviteMethod === INVITE_METHOD.SSO) {
    const provider = ssoProvider === SSO_PROVIDER.GOOGLE ? "Google" : "Microsoft";
    const ctaLabel = `Sign in with ${provider}`;
    const stepsHtml =
      ssoProvider === SSO_PROVIDER.GOOGLE
        ? `
        <ol style="margin:0 0 16px;padding-left:20px;color:#0f172a;font-size:14px;line-height:1.6;">
          <li>Click the <strong>Sign in with Google</strong> button below.</li>
          <li>Use your Google account <strong>${escapeHtml(to)}</strong> to authenticate.</li>
          <li>You will be redirected to your Quikit dashboard.</li>
        </ol>`
        : `
        <ol style="margin:0 0 16px;padding-left:20px;color:#0f172a;font-size:14px;line-height:1.6;">
          <li>Click the <strong>Sign in with Microsoft</strong> button below.</li>
          <li>Use your Microsoft account <strong>${escapeHtml(to)}</strong> to authenticate.</li>
          <li>You will be redirected to your Quikit dashboard.</li>
        </ol>`;

    const html = `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.07);">
        <div style="background:${accent};padding:32px 40px;">${headerInner}</div>
        <div style="padding:40px;">
          <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:600;">Hi ${safeFirst},</h2>
          <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">
            ${safeInviter} has added you as the <strong>${safeRole}</strong> for <strong>${safeOrg}</strong> on the Quikit platform.
          </p>
          <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:600;">You have been granted access to:</p>
          ${appListHtml(appNames)}
          <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:600;">Getting started:</p>
          ${stepsHtml}
          <a href="${loginUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:500;">${ctaLabel}</a>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.5;">
            Alternatively, visit:<br>
            <a href="${loginUrl}" style="color:${accent};word-break:break-all;">${loginUrl}</a>
          </p>
          <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">This invitation is valid for 7 days from the date of this email.</p>
        </div>
        <div style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">Quikit by Moreyeahs &middot; If you didn't expect this, you can ignore this email.</p>
        </div>
      </div>
    </body></html>`;

    const subject = isReminder
      ? `Reminder: you've been invited to join ${orgName} on Quikit`
      : `You've been invited to join ${orgName} on Quikit`;

    return { subject, html };
  }

  // ── Native Email branch (FRD §4.2) ──────────────────────────────────────
  const html = `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.07);">
      <div style="background:${accent};padding:32px 40px;">${headerInner}</div>
      <div style="padding:40px;">
        <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:600;">Hi ${safeFirst},</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">
          ${safeInviter} has set you up as the <strong>${safeRole}</strong> for <strong>${safeOrg}</strong> on the Quikit platform.
        </p>
        <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:600;">You have been granted access to:</p>
        ${appListHtml(appNames)}
        <div style="margin:0 0 16px;padding:16px;background:#f1f5f9;border-radius:8px;">
          <p style="margin:0 0 6px;color:#0f172a;font-size:14px;font-weight:600;">Your login details</p>
          <p style="margin:${displayPassword ? "0 0 4px" : "0"};color:#0f172a;font-size:14px;">Email: <strong>${escapeHtml(to)}</strong></p>
          ${displayPassword
            ? `<p style="margin:0;color:#0f172a;font-size:14px;">Temporary password: <strong>${escapeHtml(displayPassword)}</strong></p>`
            : ""}
        </div>
        <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:600;">Getting started:</p>
        <ol style="margin:0 0 16px;padding-left:20px;color:#0f172a;font-size:14px;line-height:1.6;">
          <li>Click the link below.</li>
          ${displayPassword ? `<li>Enter your temporary password.</li>` : ""}
          <li>You will be prompted to set a new password.</li>
          <li>Log in with your credentials.</li>
        </ol>
        <a href="${acceptUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:500;">Set Up My Account</a>
        <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.5;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${acceptUrl}" style="color:${accent};word-break:break-all;">${acceptUrl}</a>
        </p>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">For security, we recommend setting a new password on your first login. This invitation is valid for 7 days.</p>
      </div>
      <div style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">Quikit by Moreyeahs &middot; If you didn't expect this, you can ignore this email.</p>
      </div>
    </div>
  </body></html>`;

  const subject = isReminder
    ? `Reminder: welcome to ${orgName} on Quikit — your login details`
    : `Welcome to ${orgName} on Quikit — your login details`;

  return { subject, html };
}
