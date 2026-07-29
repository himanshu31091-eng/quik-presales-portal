"use client";

import { SignInComponent } from "@quikit/ui";
import { useSearchParams } from "next/navigation";

const LogoComponent = () => (
  <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl p-2">
    <span className="text-lg font-bold">Q</span>
  </div>
);

// Kept in sync with the central auth login (apps/auth/app/login/page.tsx) so any
// `?reason=` the shared middleware can emit renders a banner here too.
const REASON_MESSAGES: Record<string, string> = {
  deactivated: "Your membership has been deactivated by an administrator.",
  app_revoked: "Your app access has been revoked. Contact your org admin.",
  unauthorized: "You don't have permission to access that page.",
  session_expired: "Your session expired. Please sign in again.",
  invalid_user_info: "Invalid user information.",
};

/** Local credentials login when `NEXT_PUBLIC_AUTH_URL` is unset (fallback dev). */
export function LoginPageClient() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const message = reason ? REASON_MESSAGES[reason] : null;

  return (
    <div className="relative">
      {message && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center px-4 py-3 bg-amber-500/90 backdrop-blur-sm">
          <p className="text-sm font-medium text-black">{message}</p>
        </div>
      )}
      <SignInComponent logo={<LogoComponent />} brandName="QuikIT" />
    </div>
  );
}
