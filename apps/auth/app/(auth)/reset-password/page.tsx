import { redirect } from "next/navigation";

/**
 * Legacy route. Password reset is now driven by an OTP flow inline in the
 * sign-in component at /login. Any old reset-link emails (which carried a
 * `?token=...` query) are obsolete — those tokens were DB-backed and the
 * table has since been retired in favor of Redis-stored OTPs. Land users
 * back on /login so they can request a fresh code.
 */
export default function ResetPasswordPage() {
  redirect("/login");
}
