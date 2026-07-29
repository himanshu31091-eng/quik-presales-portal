import { Resend } from "resend";
import { requireProdEnv } from "./env";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
  }
  return _resend;
}

/**
 * Resolved at call time (not module-scope) so that apps which import this
 * module but never send an email don't crash at boot when APP_URL is unset
 * in a preview environment. In production, the first send attempt throws
 * with a clear error; in dev, it falls back to the local app port.
 */
function appUrl(): string {
  return requireProdEnv("APP_URL", "http://localhost:3001"); // prod-safety-allow: dev fallback, prod throws
}

/** Escape HTML to prevent XSS in email templates */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface InvitationEmailParams {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  token: string;
}

export async function sendInvitationEmail({
  to,
  orgName,
  inviterName,
  role,
  token,
}: InvitationEmailParams) {
  const acceptUrl = `${appUrl()}/invitations/accept?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(15,23,42,0.07);">
        <div style="background:#0f172a;padding:32px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">QuikScale</h1>
        </div>
        <div style="padding:40px;">
          <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:600;">You're invited!</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">
            <strong>${esc(inviterName)}</strong> has invited you to join <strong>${esc(orgName)}</strong> as a <strong>${esc(role)}</strong>.
          </p>
          <a href="${acceptUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:500;">
            Accept Invitation
          </a>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.5;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${acceptUrl}" style="color:#6366f1;word-break:break-all;">${acceptUrl}</a>
          </p>
        </div>
        <div style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">This invitation was sent by QuikScale. If you didn't expect this, you can ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const { data, error } = await getResend().emails.send({
      from: "QuikScale <onboarding@resend.dev>",
      to,
      subject: `You're invited to join ${orgName} on QuikScale`,
      html,
    });

    if (error) {
      console.error("Failed to send invitation email:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("Email send error:", err);
    return { success: false, error: err };
  }
}
