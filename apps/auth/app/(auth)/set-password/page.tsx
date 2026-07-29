"use client";

import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { requireProdEnv } from "@quikit/shared";
import { authThemeCss } from "@quikit/ui";

/**
 * FRD FR-SA-009 / FR-SA-010 — Set / Create Password screen.
 *
 * Shown ONCE on first login for users created via native invite. They MUST
 * save a new password — the legacy "Skip for now" affordance was removed
 * when temp passwords became unique per-invite (a one-time password must
 * never be kept as the user's standing credential).
 *
 * Reached when `mustChangePassword` is true (the sign-in flow routes here
 * before the user is sent on to the launcher).
 *
 * Two-panel dark layout matching the login / register redesign. The current
 * (temporary) password field is retained — the endpoint validates it — even
 * though the marketing "create-password" mock only showed new + confirm.
 */

const BRAND_NAME = "QuikIT";

export default function SetPasswordPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Env-only — `NEXT_PUBLIC_LAUNCHER_URL` is required in prod (throws at
  // render time if unset); dev falls back to the local launcher.
  const launcherUrl = `${requireProdEnv(
    "NEXT_PUBLIC_LAUNCHER_URL",
    "http://localhost:3001",
  ).replace(/\/+$/, "")}/apps`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setError("Password must contain at least one special character.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/me/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Could not set your password. Please try again.");
        setSubmitting(false);
        return;
      }
      // FR-SA-010 — after successful set, send the user to the standard
      // post-login destination. Hard nav so the JWT picks up the cleared
      // mustChangePassword flag on the next round-trip.
      window.location.href = launcherUrl;
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="qk-setpw" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: authThemeCss(".qk-setpw") }} />
      <div className="qk-guides" aria-hidden="true">
        <span className="qk-guides__drop qk-guides__drop--left" />
        <span className="qk-guides__drop qk-guides__drop--right" />
      </div>
      <div className="auth-layout">
        {/* ── Left brand panel ── */}
        <aside className="auth-side">
          <div className="auth-side-head">
            <a href="/login" className="auth-back" aria-label="Back to sign in">
              <ArrowLeft size={18} />
            </a>
            <div className="auth-brand-content">
              <span className="auth-eyebrow">Last step</span>
              <h2 className="auth-brand-title">Create your password.</h2>
              <p className="auth-brand-subtitle">Secure your new workspace.</p>
              <p className="auth-brand-desc">
                Choose a strong password — you&apos;ll use it together with your email to
                sign in to {BRAND_NAME}.
              </p>
            </div>
          </div>
        </aside>

        {/* ── Right form panel ── */}
        <main className="auth-main">
          <div className="auth-main-top">
            <a href="/" className="auth-logo" aria-label={BRAND_NAME}>{BRAND_NAME}</a>
            <button type="button" className="auth-theme"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          <div className="auth-card">
            <h1>Create a password</h1>
            <p className="auth-sub">Choose a strong password to secure your account.</p>

            {error && <div className="auth-banner auth-banner--error">{error}</div>}

            <form onSubmit={handleSubmit} noValidate>
              <div className="auth-field">
                <label htmlFor="current-password">Current (temporary) password</label>
                <div className="auth-password">
                  <input id="current-password" type={showCurrent ? "text" : "password"}
                    autoComplete="current-password" placeholder="default password from your invite email"
                    value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                  <button type="button" className="auth-eye"
                    onClick={() => setShowCurrent((v) => !v)}
                    aria-label={showCurrent ? "Hide password" : "Show password"}>
                    {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="new-password">New password</label>
                <div className="auth-password">
                  <input id="new-password" type={showNew ? "text" : "password"}
                    autoComplete="new-password" placeholder="min 8 chars, 1 uppercase, 1 number, 1 special"
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
                  <button type="button" className="auth-eye"
                    onClick={() => setShowNew((v) => !v)}
                    aria-label={showNew ? "Hide password" : "Show password"}>
                    {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="confirm-password">Confirm password</label>
                <div className="auth-password">
                  <input id="confirm-password" type={showNew ? "text" : "password"}
                    autoComplete="new-password" placeholder="re-enter password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
                </div>
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="auth-error">Passwords don&apos;t match.</p>
                )}
              </div>

              <button type="submit" className="auth-submit" disabled={submitting}>
                {submitting ? "Saving…" : "Create password & continue"}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
