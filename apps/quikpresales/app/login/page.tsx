"use client";

import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Login route.
 *
 * SSO via @quikit/auth is the supported flow and stays the default: whenever the
 * `quikit` provider is configured this page redirects straight into it, exactly
 * as before.
 *
 * It renders a password form ONLY when the server has no `quikit` provider.
 * That is not an alternative to SSO — it is the same decision `lib/auth.ts`
 * already makes: with QUIKIT_URL / QUIKIT_CLIENT_ID / QUIKIT_CLIENT_SECRET
 * unset it builds a CredentialsProvider instead. Before this, the page called
 * signIn("quikit") unconditionally, so in that configuration a provider that did
 * not exist was requested and the page looped forever — the app could not be
 * logged into at all without the launcher and auth services running alongside
 * it. The provider list is the single source of truth for which mode we are in.
 */

type Mode = "detecting" | "sso" | "credentials";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("detecting");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
      return;
    }
    if (status !== "unauthenticated") return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/providers");
        const providers = (await res.json()) as Record<string, unknown> | null;
        if (cancelled) return;

        if (providers && "quikit" in providers) {
          setMode("sso");
          void signIn("quikit", { callbackUrl: "/dashboard" });
        } else {
          setMode("credentials");
        }
      } catch {
        // If the provider list is unreachable, offer the form rather than
        // looping on a redirect that cannot succeed.
        if (!cancelled) setMode("credentials");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      setSubmitting(false);

      if (result?.error) {
        // NextAuth returns a generic code here; do not leak whether the address
        // exists.
        setError("Those credentials were not accepted.");
        return;
      }
      router.replace("/dashboard");
    },
    [email, password, router],
  );

  if (mode !== "credentials") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Redirecting to sign-in…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-gray-900">Sign in to QuikPreSales</h1>
        <p className="mt-1 text-xs text-gray-500">
          Single sign-on is not configured for this deployment, so sign in with your
          QuikIT email and password.
        </p>

        <label className="mt-5 block text-sm">
          <span className="mb-1 block text-gray-600">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-700"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-gray-600">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-700"
          />
        </label>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
