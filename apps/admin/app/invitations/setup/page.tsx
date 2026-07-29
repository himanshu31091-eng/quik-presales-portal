"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";

interface InviteInfo {
  firstName: string;
  orgName: string;
  email: string;
}

function SetupContent() {
  const params = useSearchParams();
  const token  = params.get("token") ?? "";

  const [invite, setInvite]           = useState<InviteInfo | null>(null);
  const [checking, setChecking]       = useState(true);
  const [invalid, setInvalid]         = useState(false);
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => {
    if (!token) { setInvalid(true); setChecking(false); return; }
    fetch(`/api/invitations/check?token=${token}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.valid) {
          setInvite({ firstName: res.firstName, orgName: res.orgName, email: res.email });
        } else {
          setInvalid(true);
        }
      })
      .catch(() => setInvalid(true))
      .finally(() => setChecking(false));
  }, [token]);

  const rules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "One uppercase letter",  ok: /[A-Z]/.test(password) },
    { label: "One number",            ok: /\d/.test(password) },
  ];
  const passwordsMatch = password === confirm && confirm.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!rules.every((r) => r.ok)) { setError("Password does not meet requirements."); return; }
    if (!passwordsMatch) { setError("Passwords do not match."); return; }

    setSubmitting(true);
    try {
      // 1. Activate membership + set password
      const acceptRes = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword: confirm }),
      });
      const acceptJson = await acceptRes.json();
      if (!acceptJson.success) { setError(acceptJson.error ?? "Failed to activate invitation."); return; }

      // Accept API sets the session cookie with orgId — navigate directly
      const { role } = acceptJson.data;
      const isAdmin = role === "admin" || role === "super_admin";
      window.location.href = isAdmin ? "/launcher" : "/member/apps";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-secondary)]" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-secondary)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-8 shadow-xl text-center">
          <div className="mb-6 flex justify-center">
            <span className="text-2xl font-extrabold text-[var(--color-secondary)]">QuikIT</span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            This invitation link is invalid or has already been used.{" "}
            <a href="/login" className="text-[var(--color-secondary)] underline">Go to login</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-secondary)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-8 shadow-xl">

        <div className="mb-6 text-center">
          <span className="text-2xl font-extrabold text-[var(--color-secondary)]">QuikIT</span>
        </div>

        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Set your password</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)] mb-6">
          Create a password to join <strong>{invite?.orgName}</strong>.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email — read-only */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">Email</label>
            <input
              type="email"
              value={invite?.email ?? ""}
              readOnly
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm text-[var(--color-text-secondary)] cursor-not-allowed"
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                required
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 pr-10 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <ul className="mt-2 space-y-1">
                {rules.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-green-600" : "text-[var(--color-text-tertiary)]"}`}>
                    <CheckCircle2 className={`h-3 w-3 ${r.ok ? "text-green-500" : "text-[var(--color-neutral-200)]"}`} />
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                required
                className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] bg-[var(--color-bg-primary)] ${
                  confirm.length > 0
                    ? passwordsMatch
                      ? "border-green-400"
                      : "border-red-400"
                    : "border-[var(--color-border)]"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-secondary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-secondary-dark)] transition-colors disabled:opacity-60 mt-2"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Setting up your account…</>
            ) : (
              `Create Account & Join ${invite?.orgName}`
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[var(--color-text-tertiary)]">
          Already have an account?{" "}
          <a href="/login" className="text-[var(--color-secondary)] underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}

export default function InvitationSetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}
