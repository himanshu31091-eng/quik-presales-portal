"use client";

import { useSearchParams } from "next/navigation";
import { SignInComponent } from "@quikit/ui";
import { requireProdEnv } from "@quikit/shared";

/**
 * Native-invite acceptance page. The "Set Up My Account" link in the
 * onboarding email targets `${NEXT_PUBLIC_AUTH_URL}/invitations/accept?token=…`
 * and lands here. We render the shared `SignInComponent` opened on its
 * `"invitation"` step, which:
 *
 *   - Validates the token via GET /api/invitations/accept on mount.
 *   - Renders the "Set your password" form on the same dark split-screen
 *     shell that the /login page uses (so the two flows feel cohesive).
 *   - On Save & Continue: POSTs the new password, activates the membership,
 *     auto-signs the user in, and ships them to the launcher.
 *   - On Skip for now: POSTs `skip:true`, falls back to the email step so
 *     the user signs in manually with the default password (FR-SA-010).
 *
 * Lives at the top level (NOT under the `(auth)` route group) so the
 * SignInComponent's own `min-h-screen w-screen` layout takes the whole
 * viewport rather than being boxed inside the auth-card layout.
 */
export default function InvitationAcceptPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // Env-only — `NEXT_PUBLIC_LAUNCHER_URL` required in prod (throws at
  // render time if unset); dev falls back to the local launcher. Normalize
  // to exactly one trailing `/apps`.
  const launcherUrl = requireProdEnv(
    "NEXT_PUBLIC_LAUNCHER_URL",
    "http://localhost:3001",
  );
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
