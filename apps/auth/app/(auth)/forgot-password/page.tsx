"use client";

// Force dynamic — see comment in apps/auth/app/login/page.tsx.
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SignInComponent } from "@quikit/ui";
import { requireProdEnv } from "@quikit/shared";


/**
 * Standalone Forgot-Password page.
 *
 * The shared `SignInComponent` renders all auth flows; we just mount it
 * with `initialStep="forgot-email"` so it opens directly on the email-entry
 * screen of the password-reset state machine. From there the same component
 * walks the user through OTP → new-password → confetti → auto sign-in,
 * which ends at `callbackUrl` (cross-domain bridge) or `redirectPath`.
 */
function ForgotPasswordInner() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl");
  return (
    <SignInComponent
      brandName="QuikIT"
      redirectPath={`${requireProdEnv(
        "NEXT_PUBLIC_LAUNCHER_URL",
        "http://localhost:3001",
      ).replace(/\/+$/, "")}/apps`}
      callbackUrl={callbackUrl}
      initialStep="forgot-email"
      hardNavigate
    />
  );
}

export default function ForgotPasswordPage() {
  // useSearchParams must be inside <Suspense> when used in a page.
  return (
    <Suspense fallback={null}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
