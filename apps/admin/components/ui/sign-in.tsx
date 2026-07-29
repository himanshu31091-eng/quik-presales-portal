"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Button, Input } from "@quikit/ui";
import { Suspense } from "react";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const { resolvedTheme } = useTheme();

  // Theme-aware Admin wordmark lockup. `mounted` gates the next-themes
  // undefined-on-first-render so we default to the dark-badge (light-theme)
  // asset and avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wordmarkSrc =
    mounted && resolvedTheme === "dark"
      ? "/brand/admin-wordmark-light.svg"
      : "/brand/admin-wordmark-dark.svg";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email: email.toLowerCase(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    // Full page navigation so the middleware reads the new session cookie.
    // Org selection happens on the central launcher /apps, not a local page.
    const launcher = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(/\/+$/, "");
    window.location.href = launcher ? `${launcher}/apps` : "/";
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-8 shadow-sm">
      <div className="mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={wordmarkSrc}
          alt="Admin Portal"
          className="h-9 w-auto object-contain"
        />
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          Sign in to your organisation dashboard
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" loading={loading} className="w-full mt-2">
          Sign in
        </Button>
      </form>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
