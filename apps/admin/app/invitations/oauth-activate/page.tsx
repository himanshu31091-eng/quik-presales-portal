"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { Loader2, XCircle } from "lucide-react";

function OAuthActivateContent() {
  const params                        = useSearchParams();
  const router                        = useRouter();
  const token                         = params.get("token") ?? "";
  const { data: session, status, update } = useSession();
  const [error, setError]             = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || !session) {
      router.push(`/invitations/accept?token=${token}`);
      return;
    }
    if (!token) { setError("Missing invitation token."); return; }

    async function activate() {
      try {
        // 1. Activate membership (OAuth path — no password)
        const activateRes = await fetch("/api/invitations/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const activateJson = await activateRes.json();
        if (!activateJson.success) {
          // Already accepted — send to the central launcher /apps, which
          // resolves the org and hands the user back.
          if (activateRes.status === 409) {
            const launcher = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
            window.location.href = launcher ? `${launcher}/apps` : "/";
            return;
          }
          setError(activateJson.error ?? "Failed to activate invitation.");
          return;
        }

        const { orgId, role } = activateJson.data;

        // 2. Set org in session
        await fetch("/api/org/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId }),
        });
        await update({ orgId });

        // 3. Redirect based on role
        const isAdmin = role === "admin" || role === "super_admin";
        router.push(isAdmin ? "/launcher" : "/member/apps");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    }

    activate();
  }, [status, session, token, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-secondary)] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-8 shadow-xl text-center">
          <div className="mb-6 flex justify-center">
            <span className="text-2xl font-extrabold text-[var(--color-secondary)]">QuikIT</span>
          </div>
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
          </div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">Activation Failed</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">{error}</p>
          <a
            href="/login"
            className="inline-flex items-center justify-center w-full rounded-xl bg-[var(--color-secondary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-secondary-dark)] transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--color-bg-secondary)]">
      <span className="text-2xl font-extrabold text-[var(--color-secondary)]">QuikIT</span>
      <Loader2 className="h-8 w-8 animate-spin text-[var(--color-secondary)]" />
      <p className="text-sm text-[var(--color-text-secondary)]">Setting up your account…</p>
    </div>
  );
}

export default function OAuthActivatePage() {
  return (
    <Suspense>
      <OAuthActivateContent />
    </Suspense>
  );
}
