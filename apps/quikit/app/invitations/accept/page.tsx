"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SignInComponent } from "@quikit/ui";

/**
 * Native-invite acceptance page. The "Set Up My Account" link in the
 * onboarding email targets `${NEXT_PUBLIC_QUIKIT_URL}/invitations/accept?token=…`
 * (port 3001 in dev). We render the shared `SignInComponent` on its
 * `"invitation"` step, which:
 *
 *   - Validates the token via GET /api/invitations/accept on mount.
 *   - Renders the Default / New / Confirm password form on the same
 *     split-screen shell the /login page uses.
 *   - On Save & Continue: POSTs the new password, activates the
 *     membership, auto-signs the user in, and ships them to /apps.
 *   - On Skip for now: POSTs `skip:true`, falls back to the email step
 *     so the user signs in manually with the temporary password
 *     (FR-SA-010 / BR-008).
 *
 * Lives at the top level (NOT under the `(marketing)` route group) so
 * the SignInComponent's `min-h-screen w-screen` layout takes the whole
 * viewport instead of being painted over by the marketing watercolor
 * intro.
 */
function AcceptContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // Same-host launcher URL — used both as the redirect target after
  // Save & Continue and to anchor the SignInComponent's invitation step.
  // We do NOT use NEXT_PUBLIC_AUTH_URL here: the email link, this page,
  // and the same-origin POST to /api/invitations/accept all live on the
  // launcher origin, so we stay on this origin end-to-end.
  const launcherUrl =
    (typeof window !== "undefined" && window.location.origin) ||
    process.env.NEXT_PUBLIC_QUIKIT_URL ||
    "http://localhost:3001";
  const launcherApps = `${launcherUrl.replace(/\/+$/, "").replace(/\/apps$/, "")}/apps`;

  return (
    <SignInComponent
      brandName="QuikIT"
      redirectPath={launcherApps}
      hardNavigate
      initialStep="invitation"
      invitationToken={token}
      invitationLauncherUrl={launcherUrl}
    />
  );
}

export default function InvitationAcceptPage() {
  return (
    <Suspense fallback={null}>
      <AcceptContent />
    </Suspense>
  );
}
