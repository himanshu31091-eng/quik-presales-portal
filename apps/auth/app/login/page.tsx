"use client";

// Force dynamic — the page reads URL params + spawns a confetti canvas + lots
// of stateful sub-components. Static prerender of `useContext`-heavy children
// (next-auth/react, etc.) blows up in our shared @quikit/ui package.
export const dynamic = "force-dynamic";


import { useSearchParams } from "next/navigation";
import { SignInComponent } from "@quikit/ui";
import { requireProdEnv } from "@quikit/shared";

const REASON_MESSAGES: Record<string, string> = {
  deactivated: "Your membership has been deactivated by an administrator.",
  app_revoked: "Your app access has been revoked. Contact your org admin.",
  unauthorized: "You don't have permission to access that page.",
  session_expired: "Your session expired. Please sign in again.",
  invalid_user_info: "Invalid user information.",
};

const VALID_INITIAL_STEPS = new Set([
  "email",
  "password",
  "login",
  "profile",
  "forgot-email",
  "forgot-otp",
  "new-password",
]);

export default function LoginPage() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const callbackUrl = params.get("callbackUrl");
  const stepParam = params.get("step");
  const initialError = reason ? REASON_MESSAGES[reason] ?? null : null;
  const initialStep =
    stepParam && VALID_INITIAL_STEPS.has(stepParam)
      ? (stepParam as
          | "email"
          | "password"
          | "login"
          | "profile"
          | "forgot-email"
          | "forgot-otp"
          | "new-password")
      : undefined;

  return (
    <SignInComponent
      brandName="QuikIT"
      redirectPath={`${requireProdEnv("NEXT_PUBLIC_LAUNCHER_URL", "http://localhost:3001").replace(/\/+$/, "")}/apps`}
      callbackUrl={callbackUrl}
      initialError={initialError}
      initialStep={initialStep}
      signUpUrl="/register"
      hardNavigate
    />
  );
}
