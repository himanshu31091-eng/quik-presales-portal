"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Login route — auto-triggers QuikIT SSO sign-in.
 *
 * Don't add a custom username/password form here. SSO via @quikit/auth is the
 * only supported flow. This page exists so middleware has somewhere to redirect.
 */
export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      void signIn("quikit", { callbackUrl: "/" });
    }
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Redirecting to sign-in…</p>
    </div>
  );
}
