"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import {
  Loader2, XCircle, AlertCircle, CheckCircle2,
  Mail, Chrome, Building2,
} from "lucide-react";

type State =
  | { status: "loading" }
  | { status: "valid"; firstName: string; orgName: string; email: string }
  | { status: "revoked" }
  | { status: "used" }
  | { status: "missing" };

function AcceptContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!token) { setState({ status: "missing" }); return; }
    fetch(`/api/invitations/check?token=${token}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.valid) {
          setState({ status: "valid", firstName: res.firstName, orgName: res.orgName, email: res.email });
        } else {
          setState({ status: res.reason === "used" ? "used" : "revoked" });
        }
      })
      .catch(() => setState({ status: "revoked" }));
  }, [token]);

  function handleGoogle() {
    signIn("google", { callbackUrl: `/invitations/oauth-activate?token=${token}` });
  }

  function handleMicrosoft() {
    signIn("azure-ad", { callbackUrl: `/invitations/oauth-activate?token=${token}` });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-secondary)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-8 shadow-xl text-center">

        <div className="mb-6 flex justify-center">
          <span className="text-2xl font-extrabold text-[var(--color-secondary)]">QuikIT</span>
        </div>

        {state.status === "loading" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-[var(--color-secondary)]" />
            <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Verifying your invitation…</p>
          </>
        )}

        {state.status === "valid" && (
          <>
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-secondary-light)]">
                <Building2 className="h-7 w-7 text-[var(--color-secondary)]" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              You've been invited!
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)] mb-8">
              Hi <strong className="text-[var(--color-text-primary)]">{state.firstName}</strong>, join{" "}
              <strong className="text-[var(--color-text-primary)]">{state.orgName}</strong> on QuikIT.
              Choose how you'd like to sign in.
            </p>

            <div className="flex flex-col gap-3">
              {/* Email / Password */}
              <a
                href={`/invitations/setup?token=${token}`}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-light)] transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-neutral-100)]">
                  <Mail className="h-4 w-4 text-[var(--color-text-secondary)]" />
                </span>
                <span className="flex-1 text-left">
                  Continue with Email
                  <span className="block text-xs text-[var(--color-text-tertiary)] font-normal">{state.email}</span>
                </span>
              </a>

              {/* Google */}
              <button
                onClick={handleGoogle}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-light)] transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-neutral-100)]">
                  <Chrome className="h-4 w-4 text-[var(--color-text-secondary)]" />
                </span>
                <span className="flex-1 text-left">Continue with Google</span>
              </button>

              {/* Microsoft */}
              <button
                onClick={handleMicrosoft}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-light)] transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-neutral-100)]">
                  {/* Microsoft "4 squares" icon using divs */}
                  <span className="grid grid-cols-2 gap-0.5 h-4 w-4">
                    <span className="bg-[#f25022] rounded-sm" />
                    <span className="bg-[#7fba00] rounded-sm" />
                    <span className="bg-[#00a4ef] rounded-sm" />
                    <span className="bg-[#ffb900] rounded-sm" />
                  </span>
                </span>
                <span className="flex-1 text-left">Continue with Microsoft</span>
              </button>
            </div>

            <p className="mt-6 text-xs text-[var(--color-text-tertiary)]">
              By continuing you agree to QuikIT's Terms of Service.
            </p>
          </>
        )}

        {state.status === "revoked" && (
          <>
            <div className="flex justify-center mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Access Revoked</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Your invitation has been revoked by the organisation administrator.
              This link is no longer valid. Please contact your administrator if you believe this is a mistake.
            </p>
          </>
        )}

        {state.status === "used" && (
          <>
            <div className="flex justify-center mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <CheckCircle2 className="h-8 w-8 text-blue-500" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Already Accepted</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              This invitation has already been accepted. Log in to access your organisation.
            </p>
            <a
              href="/login"
              className="inline-flex items-center justify-center w-full rounded-xl bg-[var(--color-secondary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
            >
              Go to Login
            </a>
          </>
        )}

        {state.status === "missing" && (
          <>
            <div className="flex justify-center mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
                <AlertCircle className="h-8 w-8 text-amber-500" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Invalid Link</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              This invitation link is invalid. Please use the original link from your invitation email.
            </p>
          </>
        )}

        <p className="mt-6 text-xs text-[var(--color-text-tertiary)]">
          Questions? Contact your organisation administrator.
        </p>
      </div>
    </div>
  );
}

export default function InvitationAcceptPage() {
  return (
    <Suspense>
      <AcceptContent />
    </Suspense>
  );
}
