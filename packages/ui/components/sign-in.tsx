"use client";

import React, {
  useState, useRef, useEffect, forwardRef,
  useImperativeHandle, useMemo, useCallback,
} from "react";
import { Eye, EyeOff, ArrowLeft, X, AlertCircle, PartyPopper, Loader, Sun, Moon, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn as nextAuthSignIn } from "next-auth/react";
import type { GlobalOptions as ConfettiGlobalOptions, CreateTypes as ConfettiInstance, Options as ConfettiOptions } from "canvas-confetti";
import confetti from "canvas-confetti";
import { authThemeCss } from "../lib/auth-theme-css";

/* ─── Confetti ─── */
type Api = { fire: (options?: ConfettiOptions) => void };
export type ConfettiRef = Api | null;

const Confetti = forwardRef<
  ConfettiRef,
  React.ComponentPropsWithRef<"canvas"> & {
    options?: ConfettiOptions;
    globalOptions?: ConfettiGlobalOptions;
    manualstart?: boolean;
  }
>((props, ref) => {
  const { options, globalOptions = { resize: true, useWorker: true }, manualstart = false, ...rest } = props;
  const instanceRef = useRef<ConfettiInstance | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement) => {
    if (node !== null) {
      if (instanceRef.current) return;
      instanceRef.current = confetti.create(node, { ...globalOptions, resize: true });
    } else {
      instanceRef.current?.reset();
      instanceRef.current = null;
    }
  }, [globalOptions]);
  const fire = useCallback((opts = {}) => instanceRef.current?.({ ...options, ...opts }), [options]);
  const api = useMemo(() => ({ fire }), [fire]);
  useImperativeHandle(ref, () => api, [api]);
  useEffect(() => { if (!manualstart) fire(); }, [manualstart, fire]);
  return <canvas ref={canvasRef} {...rest} />;
});
Confetti.displayName = "Confetti";

/* ─── Icons ─── */
const GoogleIcon = () => (
  <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="18" height="18">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.79 2.71v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.95 10.7a5.41 5.41 0 0 1 0-3.4V4.97H.96a9 9 0 0 0 0 8.06l3-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="18" height="18">
    <rect x="2" y="2" width="9" height="9" fill="#F25022"/>
    <rect x="13" y="2" width="9" height="9" fill="#7FBA00"/>
    <rect x="2" y="13" width="9" height="9" fill="#00A4EF"/>
    <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
  </svg>
);

/* ─── Brand-panel copy (left side of the split layout) ─── */
const BRAND_POINTS = [
  "One Login. Every {brand} App.",
  "AI-Powered Workflows That Save Time",
  "Connected Data. Smarter Decisions.",
  "One Intelligent Platform for Your Entire Business",
  "Built to Scale as Your Business Grows",
];

/* ─── Main Component ─── */
type AuthStep = "email" | "password" | "login" | "profile" | "forgot-email" | "forgot-sent" | "forgot-otp" | "new-password" | "invitation";

interface SignInComponentProps {
  logo?: React.ReactNode;
  brandName?: string;
  redirectPath?: string;
  callbackUrl?: string | null;
  initialError?: string | null;
  hardNavigate?: boolean;
  initialStep?: AuthStep;
  invitationToken?: string | null;
  invitationLauncherUrl?: string;
  /** When set, renders a "Don't have an account? Sign up" link on the login
   *  step pointing here (the central auth app passes its /register URL).
   *  Omitted by other apps → no Sign up link (unchanged). */
  signUpUrl?: string;
}

export const SignInComponent = ({
  logo: _logo,
  brandName = "QuikIT",
  redirectPath = "/apps",
  callbackUrl,
  initialError,
  hardNavigate = true,
  initialStep,
  invitationToken,
  invitationLauncherUrl,
  signUpUrl,
}: SignInComponentProps) => {
  const router = useRouter();

  // Dark by default (the redesigned auth surface ships dark); the sun/moon
  // control in the panel header flips it to a light variant via scoped tokens.
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Normalize legacy "email" / "password" / "login" → unified "login" step.
  const normalizeStep = (s: AuthStep | undefined): AuthStep => {
    if (s === "email" || s === "password" || s === "login") return "login";
    return s ?? "login";
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>(normalizeStep(initialStep));
  const [modalStatus, setModalStatus] = useState<"closed" | "loading" | "error" | "success">("closed");
  const [modalErrorMessage, setModalErrorMessage] = useState("");
  const [banner, setBanner] = useState<string | null>(initialError ?? null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  // Forgot-password flow state
  // The backend `/api/auth/forgot-password` + `/api/auth/verify-otp` pair
  // still issues a 6-digit code. We keep the OTP plumbing in the state +
  // handlers (so the email + countdown + resend continue to work) but the
  // UI surface combines temp-password entry + new-password + confirm onto
  // a single screen. `tempPassword` is the user-typed value passed to
  // `verify-otp` as the `otp` param.
  const [tempPassword, setTempPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // Invitation state
  const [invitationLoading, setInvitationLoading] = useState<boolean>(initialStep === "invitation");
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<{
    orgName: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null>(null);
  const [inviteCurrentPassword, setInviteCurrentPassword] = useState("");
  const [inviteNewPassword, setInviteNewPassword] = useState("");
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState("");
  const [inviteShowPassword, setInviteShowPassword] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteFormError, setInviteFormError] = useState<string | null>(null);

  const confettiRef = useRef<ConfettiRef>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);

  const isEmailValid = /\S+@\S+\.\S+/.test(email);
  const isPasswordValid = password.length > 0;
  const isProfileValid = firstName.trim().length > 0 && lastName.trim().length > 0;
  const otpValue = otpDigits.join("");
  const isOtpComplete = otpValue.length === 6 && /^\d{6}$/.test(otpValue);
  const isNewPasswordValid =
    newPassword.length >= 8 && newPassword === confirmPassword;

  const fireConfetti = () => {
    const fire = confettiRef.current?.fire;
    if (!fire) return;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
    fire({ ...defaults, particleCount: 60, origin: { x: 0.1, y: 0.9 }, angle: 60 });
    fire({ ...defaults, particleCount: 60, origin: { x: 0.9, y: 0.9 }, angle: 120 });
  };

  const navigateToTarget = () => {
    const target = callbackUrl || redirectPath;
    // Cross-origin targets need to route through the auth host's
    // /api/post-login bridge so a handoff JWT is minted and the target's
    // /auth-handoff can plant a host-scoped session cookie. Direct
    // window.location.assign across origins would land the user on the
    // target with no cookie (cookies are host-only) — anonymous UI, empty
    // /apps, "User" placeholder name. Same-origin targets bypass the
    // bridge since the cookie already exists on this origin.
    let finalUrl = target;
    if (typeof window !== "undefined") {
      try {
        const targetUrl = new URL(target, window.location.origin);
        if (targetUrl.origin !== window.location.origin) {
          const bridge = new URL("/api/post-login", window.location.origin);
          bridge.searchParams.set("callbackUrl", targetUrl.toString());
          finalUrl = bridge.toString();
        }
      } catch {
        // Malformed target — fall through to verbatim navigation.
      }
    }
    if (hardNavigate) {
      window.location.assign(finalUrl);
    } else {
      router.push(finalUrl);
    }
  };

  const advancePostSignIn = async () => {
    try {
      const res = await fetch("/api/auth/me/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.complete === false) {
          setModalStatus("closed");
          setAuthStep("profile");
          return;
        }
      }
    } catch {
      // Network blip — fall through to redirect.
    }
    fireConfetti();
    setModalStatus("success");
    setTimeout(navigateToTarget, 1400);
  };

  const runSignIn = async (signInEmail: string, signInPassword: string) => {
    if (!signInEmail || !signInPassword) {
      setModalErrorMessage("Please enter your email and password.");
      setModalStatus("error");
      return;
    }
    setModalStatus("loading");
    try {
      const result = await nextAuthSignIn("credentials", {
        email: signInEmail,
        password: signInPassword,
        redirect: false,
      });
      if (result?.ok) {
        await advancePostSignIn();
      } else {
        setModalErrorMessage(result?.error === "Invalid credentials" ? "Invalid email or password." : "Sign in failed. Please try again.");
        setModalStatus("error");
      }
    } catch {
      setModalErrorMessage("Something went wrong. Please try again.");
      setModalStatus("error");
    }
  };

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProfileValid || savingProfile) return;
    setProfileError(null);
    setSavingProfile(true);
    try {
      const res = await fetch("/api/auth/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not save your name.");
      }
      fireConfetti();
      setModalStatus("success");
      setTimeout(navigateToTarget, 1100);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not save your name.");
      setSavingProfile(false);
    }
  };

  /* ─── Forgot-password (OTP) flow ───────────────────────────────────── */

  const sendOtp = async (): Promise<boolean> => {
    if (!isEmailValid) return false;
    setOtpSending(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOtpError(data?.error || "Could not send code. Try again shortly.");
        return false;
      }
      // Client-side resend cooldown — 5 minutes. The backend already
      // rate-limits per IP + per email, but this stops the user from
      // mashing "Resend temporary password" before the previous one
      // could realistically arrive. Server-side expiry of the temp
      // password itself is NOT surfaced — only the resend lockout is.
      const RESEND_COOLDOWN_SECONDS = 5 * 60;
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpExpiresAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpSecondsLeft(RESEND_COOLDOWN_SECONDS);
      return true;
    } catch {
      setOtpError("Network error. Try again.");
      return false;
    } finally {
      setOtpSending(false);
    }
  };

  const startForgotPassword = async () => {
    // The backend `/api/auth/forgot-password` resets the user's password
    // to a freshly-generated temporary password (emailed to them) and
    // flips `mustChangePassword = true`. We don't need to verify the
    // temp password against an OTP store — it's just their current
    // password now. So the UI flow becomes:
    //
    //   1. forgot-email — user types email, we hit forgot-password endpoint
    //   2. forgot-otp   — 3-field form: temp password + new + confirm
    //                     → calls signIn(credentials) with the temp password
    //                     → calls /api/auth/me/set-password to commit the new one
    //
    // No OTP store involved — the verify-otp endpoint isn't used by this flow.
    const ok = await sendOtp();
    if (ok) setAuthStep("forgot-otp");
  };

  const verifyOtpDigits = async () => {
    if (!isOtpComplete || otpVerifying) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp: otpValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setOtpError(data?.error || "Invalid or expired code.");
        setOtpDigits(["", "", "", "", "", ""]);
        setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
        return;
      }
      setResetToken(data.resetToken);
      setAuthStep("new-password");
    } catch {
      setOtpError("Network error. Try again.");
    } finally {
      setOtpVerifying(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNewPasswordValid || resetSubmitting || !resetToken) return;
    setResetError(null);
    setResetSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetToken, password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not update password.");
      }
      const signInResult = await nextAuthSignIn("credentials", {
        email,
        password: newPassword,
        redirect: false,
      });
      if (!signInResult?.ok) {
        setBanner("Password updated. Please sign in with your new password.");
        setAuthStep("login");
        setPassword("");
        setResetSubmitting(false);
        return;
      }
      fireConfetti();
      setModalStatus("success");
      setTimeout(navigateToTarget, 1200);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not update password.");
      setResetSubmitting(false);
    }
  };

  /**
   * Temporary-password reset flow.
   *
   * After `/api/auth/forgot-password` runs the user's password IS the
   * freshly-generated temporary password (emailed to them). We:
   *   1. Validate the 3 fields client-side (incl. password policy: 8+ chars,
   *      one uppercase, one number, one special).
   *   2. NextAuth credentials sign-in with the temp password — authenticates
   *      and plants the session cookie on the auth host.
   *   3. POST `/api/auth/me/set-password` with `{currentPassword: tempPw,
   *      newPassword, confirmPassword}`. The endpoint already validates
   *      bcrypt(currentPassword) + policy + sets new + clears
   *      mustChangePassword.
   *   4. Re-sign-in with the new credentials so the post-login navigation
   *      uses a fresh session.
   *
   * No OTP store, no reset token, no separate verify endpoint — the
   * existing forgot-password + set-password endpoints are everything we
   * need.
   */
  const submitResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    // Client-side validation — match the server's password policy so the
    // UI errors don't drift from the actual rejection reason.
    if (tempPassword.trim().length === 0) {
      setResetError("Enter the temporary password from your email.");
      return;
    }
    if (newPassword.length < 8) {
      setResetError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setResetError("New password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setResetError("New password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setResetError("New password must contain at least one special character.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords don't match.");
      return;
    }
    if (resetSubmitting) return;

    setResetSubmitting(true);
    try {
      // 1. Sign in with the temp password — plants the session cookie on
      //    the auth host so the `/api/auth/me/set-password` call below
      //    passes the JWT guard.
      const tempSignIn = await nextAuthSignIn("credentials", {
        email,
        password: tempPassword.trim(),
        redirect: false,
      });
      if (!tempSignIn?.ok) {
        // NextAuth surfaces the credentials provider's thrown message in
        // `tempSignIn.error` (e.g. rate-limit messages, custom validation).
        // Fall back to the generic "incorrect password" copy only when no
        // structured error was returned.
        setResetError(
          tempSignIn?.error ||
            "Temporary password is incorrect. Check the email we sent or request a new one.",
        );
        setResetSubmitting(false);
        return;
      }

      // 2. Set the new password.
      const setPwRes = await fetch("/api/auth/me/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: tempPassword.trim(),
          newPassword,
          confirmPassword,
        }),
      });
      const setPwData = await setPwRes.json().catch(() => ({}));
      if (!setPwRes.ok || !setPwData?.success) {
        throw new Error(setPwData?.error || "Could not update password.");
      }

      // 3. Re-sign-in with the NEW password so the navigated-to-target
      //    request carries a session bound to the new credentials. (The
      //    earlier sign-in is also valid, but re-signing avoids any
      //    `mustChangePassword`-related re-prompts downstream.)
      const finalSignIn = await nextAuthSignIn("credentials", {
        email,
        password: newPassword,
        redirect: false,
      });
      if (!finalSignIn?.ok) {
        setBanner("Password updated. Please sign in with your new password.");
        setAuthStep("login");
        setPassword("");
        setTempPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setResetSubmitting(false);
        return;
      }

      fireConfetti();
      setModalStatus("success");
      setTimeout(navigateToTarget, 1200);
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : "Could not update password.",
      );
      setResetSubmitting(false);
    }
  };

  /* ─── Native-invite acceptance flow ─────── */

  useEffect(() => {
    if (initialStep !== "invitation") return;
    if (!invitationToken) {
      setInvitationError("No invitation token provided.");
      setInvitationLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/invitations/accept?token=${encodeURIComponent(invitationToken)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success) {
          setInvitationData(j.data);
          if (j.data?.email) setEmail(j.data.email);
        } else {
          setInvitationError(j?.error || "Invalid invitation");
        }
      })
      .catch(() => {
        if (!cancelled) setInvitationError("Network error. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setInvitationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialStep, invitationToken]);

  const submitInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteSubmitting) return;
    setInviteFormError(null);

    if (!inviteCurrentPassword) {
      setInviteFormError("Please enter your current password.");
      return;
    }
    if (inviteNewPassword.length < 8) {
      setInviteFormError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(inviteNewPassword)) {
      setInviteFormError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(inviteNewPassword)) {
      setInviteFormError("Password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(inviteNewPassword)) {
      setInviteFormError("Password must contain at least one special character.");
      return;
    }
    if (inviteNewPassword !== inviteConfirmPassword) {
      setInviteFormError("Passwords do not match. Please re-enter.");
      return;
    }

    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: invitationToken,
          currentPassword: inviteCurrentPassword,
          newPassword: inviteNewPassword,
          confirmPassword: inviteConfirmPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setInviteFormError(json?.error ?? "Could not set your password. Please try again.");
        setInviteSubmitting(false);
        return;
      }

      setModalStatus("loading");
      const signInResult = await nextAuthSignIn("credentials", {
        email: json.data?.email ?? invitationData?.email ?? "",
        password: inviteNewPassword,
        redirect: false,
      });
      if (!signInResult?.ok) {
        setModalStatus("closed");
        setBanner("Password set. Please sign in with your new password.");
        setAuthStep("login");
        setEmail(json.data?.email ?? invitationData?.email ?? "");
        setInviteSubmitting(false);
        return;
      }
      fireConfetti();
      setModalStatus("success");
      // `redirectUrl` is the server's answer to "which app was this invitation
      // actually for?" — set only when the invitation names exactly one app, in
      // which case it points at the auth host's /api/post-login bridge so the
      // invitee lands INSIDE that app with a session on its own host. It takes
      // precedence over `invitationLauncherUrl`, which is the correct fallback
      // only for multi-app (or app-less) invitations, where the launcher grid
      // genuinely is the destination. Sending a QuikSkill invitee to the
      // launcher was the "sets password → dumped on the QuikIT launcher" bug.
      const target =
        json.data?.redirectUrl || invitationLauncherUrl || callbackUrl || redirectPath;
      setTimeout(() => {
        if (hardNavigate) window.location.assign(target);
        else router.push(target);
      }, 1200);
    } catch {
      setInviteFormError("Network error. Please try again.");
      setInviteSubmitting(false);
    }
  };

  const skipInvitation = async () => {
    if (inviteSubmitting) return;
    setInviteFormError(null);
    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invitationToken, skip: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setInviteFormError(json?.error ?? "Could not skip. Please try again.");
        setInviteSubmitting(false);
        return;
      }
      setBanner("Invitation accepted. Sign in to continue.");
      setEmail(json.data?.email ?? invitationData?.email ?? "");
      setAuthStep("login");
      setInviteSubmitting(false);
    } catch {
      setInviteFormError("Network error. Please try again.");
      setInviteSubmitting(false);
    }
  };

  const handleSocialSignIn = (provider: "google" | "microsoft") => {
    const id = provider === "microsoft" ? "azure-ad" : "google";
    setModalStatus("loading");
    // Preserve the inbound deep-link callbackUrl (e.g. when the user came
    // from scale.quikit.ai/login?callbackUrl=https://scale.quikit.ai/dashboard).
    // Without this, OAuth users always land on /login?step=profile on the
    // auth host, which then falls through to the launcher /apps (or, for
    // super admins on the un-patched middleware, to the admin portal).
    //
    // Trade-off: OAuth users whose profile is still incomplete skip the
    // profile-confirmation step when a callbackUrl is present. The profile
    // gate currently lives in client-side advancePostSignIn (credentials-only
    // path); a server-side profile gate in middleware would be the proper
    // long-term fix. Filed as follow-up.
    const target = callbackUrl || "/login?step=profile";
    nextAuthSignIn(id, { callbackUrl: target });
  };

  const handleNativeSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid) { setModalErrorMessage("Please enter a valid email address."); setModalStatus("error"); return; }
    if (!isPasswordValid) { setModalErrorMessage("Please enter your password."); setModalStatus("error"); return; }
    runSignIn(email, password);
  };

  useEffect(() => {
    if (authStep === "login") setTimeout(() => passwordInputRef.current?.focus(), 200);
    if (authStep === "profile") setTimeout(() => firstNameInputRef.current?.focus(), 200);
    if (authStep === "forgot-otp") setTimeout(() => otpInputRefs.current[0]?.focus(), 200);
    if (authStep === "new-password") setTimeout(() => newPasswordInputRef.current?.focus(), 200);
  }, [authStep]);

  useEffect(() => {
    if (authStep !== "profile") return;
    if (firstName !== "" || lastName !== "") return;
    let cancelled = false;
    fetch("/api/auth/me/profile", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        const f =
          (data.suggestedFirstName as string | null) ||
          (data.firstName as string) ||
          "";
        const l =
          (data.suggestedLastName as string | null) ||
          (data.lastName as string) ||
          "";
        if (f) setFirstName(f);
        if (l) setLastName(l);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Intentionally keyed on authStep only: this is a run-once prefill when the
    // user enters the "profile" step. firstName/lastName are read purely as a
    // guard — adding them to deps would re-fire the fetch on every keystroke
    // once the fields start filling in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStep]);

  useEffect(() => {
    if (authStep !== "forgot-otp" || !otpExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
      setOtpSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [authStep, otpExpiresAt]);

  useEffect(() => {
    if (authStep === "forgot-otp" && isOtpComplete && !otpVerifying && otpSecondsLeft > 0) {
      verifyOtpDigits();
    }
    // Fire only when the entered code (otpValue) changes. verifyOtpDigits is
    // recreated each render and closes over the current otpValue, so the call
    // always sees the latest digits. otpSecondsLeft/otpVerifying are read as
    // guards only — adding them to deps would re-fire on every countdown tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue, authStep]);

  /* ─── OTP digit input handlers ─────────────────────────────────────── */

  const handleOtpChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 0) {
      const next = [...otpDigits];
      next[index] = "";
      setOtpDigits(next);
      return;
    }
    if (digits.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        next[index + i] = digits[i]!;
      }
      setOtpDigits(next);
      const lastFilled = Math.min(index + digits.length - 1, 5);
      const nextFocus = lastFilled < 5 ? lastFilled + 1 : 5;
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }
    const next = [...otpDigits];
    next[index] = digits;
    setOtpDigits(next);
    if (index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      e.preventDefault();
      const next = [...otpDigits];
      next[index - 1] = "";
      setOtpDigits(next);
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i]!;
    setOtpDigits(next);
    const lastFilled = Math.min(text.length - 1, 5);
    const nextFocus = lastFilled < 5 ? lastFilled + 1 : 5;
    otpInputRefs.current[nextFocus]?.focus();
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const goBackToLogin = () => {
    setAuthStep("login");
    setPassword("");
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError(null);
    setOtpExpiresAt(null);
    setResetError(null);
    setNewPassword("");
    setConfirmPassword("");
  };

  /* ─── Step progress (forgot-password flow only) ─── */
  const fpStepIndex =
    authStep === "forgot-email" ? 1 :
    authStep === "forgot-sent" ? 2 :
    authStep === "forgot-otp" ? 2 :
    authStep === "new-password" ? 3 : 0;
  const isForgotFlow = fpStepIndex > 0;

  const brandPoints = BRAND_POINTS.map((p) => p.replace("{brand}", brandName));

  return (
    <div className="quikit-auth-wrap" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: authThemeCss(".quikit-auth-wrap") }} />

      <Confetti ref={confettiRef} manualstart className="fixed inset-0 pointer-events-none" style={{ zIndex: 9998 }} />

      {/* Animated background guides (vertical hairlines + falling beams) */}
      <div className="qk-guides" aria-hidden="true">
        <span className="qk-guides__drop qk-guides__drop--left" />
        <span className="qk-guides__drop qk-guides__drop--right" />
      </div>

      {/* Status modal */}
      {modalStatus !== "closed" && (
        <div className="qk-modal-overlay">
          <div className="qk-modal">
            {(modalStatus === "error" || modalStatus === "success") && (
              <button type="button" className="qk-modal-close"
                onClick={() => { setModalStatus("closed"); setModalErrorMessage(""); }}
                aria-label="Close">
                <X size={18} />
              </button>
            )}
            {modalStatus === "loading" && (
              <>
                <div className="qk-modal-icon loading"><Loader size={24} className="qk-spin" /></div>
                <div className="qk-modal-title">Signing you in…</div>
                <div className="qk-modal-msg">Verifying your credentials</div>
              </>
            )}
            {modalStatus === "error" && (
              <>
                <div className="qk-modal-icon error"><AlertCircle size={24} /></div>
                <div className="qk-modal-title">Something went wrong</div>
                <div className="qk-modal-msg">{modalErrorMessage}</div>
                <button type="button" className="auth-submit" style={{ marginTop: 8 }}
                  onClick={() => { setModalStatus("closed"); setModalErrorMessage(""); }}>
                  Try again
                </button>
              </>
            )}
            {modalStatus === "success" && (
              <>
                <div className="qk-modal-icon success"><PartyPopper size={24} /></div>
                <div className="qk-modal-title">Welcome back!</div>
                <div className="qk-modal-msg">Redirecting to your dashboard…</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="auth-layout">
        {/* ─── Left brand panel ─── */}
        <aside className="auth-side">
          <div className="auth-side-head fade-in-up d1">
            <button type="button" className="auth-back" aria-label="Back to home"
              onClick={() => { if (hardNavigate) window.location.assign("/"); else router.push("/"); }}>
              <ArrowLeft size={18} />
            </button>
            <div className="auth-brand-content">
              <span className="auth-eyebrow">{isForgotFlow ? "Account recovery" : "Welcome back"}</span>
              <h2 className="auth-brand-title">
                {isForgotFlow ? "Back into your workspace in a few steps." : `Welcome Back to ${brandName}.`}
              </h2>
              <p className="auth-brand-subtitle">
                {isForgotFlow ? "Reset your password securely." : "Everything Your Business Needs. One Login Away."}
              </p>
              <p className="auth-brand-desc">
                {isForgotFlow
                  ? "Enter your email, verify the code we send, and choose a new password to get straight back to your workspace."
                  : "Sign in to access your AI-powered workspace where your teams, customers, projects, and business operations come together in one intelligent ecosystem."}
              </p>
            </div>
          </div>

          {!isForgotFlow && (
            <div className="auth-side-bottom fade-in-up d2">
              <h3 className="auth-brand-why">Why Businesses Run on {brandName}</h3>
              <div className="auth-marquee">
                <ul className="auth-marquee-track">
                  {[...brandPoints, ...brandPoints].map((p, idx) => (
                    <li key={idx} aria-hidden={idx >= brandPoints.length}>
                      <Check size={16} strokeWidth={2.4} />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </aside>

        {/* ─── Right auth panel ─── */}
        <section className="auth-main">
          <header className="auth-main-top fade-in-up d1">
            <a href="/" className="auth-logo" aria-label={brandName}>
              {/* Theme-aware QuikIT lockup: dark UI → light (white) logo, light UI → dark logo. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={theme === "dark" ? "/brand/quikit-wordmark-light.svg" : "/brand/quikit-wordmark-dark.svg"}
                alt={brandName}
                style={{ height: 24, width: "auto", display: "block" }}
              />
            </a>
            <button type="button" className="auth-theme"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </header>

          <div className="auth-card fade-in-up d2">
            {banner && (
              <div className="auth-banner">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ flex: 1 }}>{banner}</span>
                <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss"><X size={14} /></button>
              </div>
            )}

            {/* ── Forgot-password progress dots ── */}
            {isForgotFlow && (
              <div className="fp-progress" aria-hidden="true">
                <div className={"fp-progress-step " + (fpStepIndex > 1 ? "done" : "active")} />
                <div className={"fp-progress-step " + (fpStepIndex === 2 ? "active" : fpStepIndex > 2 ? "done" : "")} />
                <div className={"fp-progress-step " + (fpStepIndex === 3 ? "active" : "")} />
              </div>
            )}

            {/* ════════════ LOGIN STEP ════════════ */}
            {authStep === "login" && (
              <>
                <h1>Welcome back to {brandName}</h1>
                <p className="auth-sub">Enter your details to sign in to your account.</p>

                <button type="button" className="auth-oauth" onClick={() => handleSocialSignIn("google")}>
                  <GoogleIcon /> Continue with Google
                </button>
                <button type="button" className="auth-oauth" onClick={() => handleSocialSignIn("microsoft")}>
                  <MicrosoftIcon /> Continue with Microsoft
                </button>

                <div className="auth-divider"><span>or sign in with</span></div>

                <form onSubmit={handleNativeSignIn} noValidate>
                  <div className="auth-field">
                    <label htmlFor="login-email">Email</label>
                    <input id="login-email" type="email" placeholder="you@company.com"
                      autoComplete="email" value={email}
                      onChange={(e) => setEmail(e.target.value)} />
                  </div>

                  <div className="auth-field">
                    <label htmlFor="login-password">Password</label>
                    <div className="auth-password">
                      <input id="login-password" ref={passwordInputRef}
                        type={showPassword ? "text" : "password"}
                        placeholder="minimum 8 characters"
                        autoComplete="current-password" value={password}
                        onChange={(e) => setPassword(e.target.value)} />
                      <button type="button" className="auth-eye"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button type="button" className="auth-forgot"
                    onClick={() => setAuthStep("forgot-email")}>
                    Forgot password?
                  </button>

                  <button type="submit" className="auth-submit"
                    disabled={modalStatus === "loading"}>
                    Sign in
                  </button>
                </form>

                {signUpUrl && (
                  <p className="auth-alt">
                    Don&apos;t have an account?{" "}
                    <a href={signUpUrl}>Sign up</a>
                  </p>
                )}
              </>
            )}

            {/* ════════════ PROFILE STEP ════════════ */}
            {authStep === "profile" && (
              <>
                <h1>Confirm your name</h1>
                <p className="auth-sub">We&apos;ll show this on your account and to teammates.</p>

                <form onSubmit={submitProfile} noValidate>
                  <div className="auth-field">
                    <label htmlFor="first-name">First name</label>
                    <input id="first-name" ref={firstNameInputRef} type="text"
                      autoComplete="given-name" value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane" />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="last-name">Last name</label>
                    <input id="last-name" type="text" autoComplete="family-name"
                      value={lastName} onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe" />
                  </div>
                  {profileError && <p className="auth-error">{profileError}</p>}
                  <button type="submit" className="auth-submit"
                    disabled={!isProfileValid || savingProfile}>
                    {savingProfile ? "Saving…" : "Save & Continue →"}
                  </button>
                </form>
              </>
            )}

            {/* ════════════ FORGOT-EMAIL STEP ════════════ */}
            {authStep === "forgot-email" && (
              <>
                <h1>Reset your password</h1>
                <p className="auth-sub">Enter the email on your account and we&apos;ll send you a verification code.</p>

                <form onSubmit={async (e) => { e.preventDefault(); await startForgotPassword(); }} noValidate>
                  <div className="auth-field">
                    <label htmlFor="fp-email">Email</label>
                    <input id="fp-email" type="email" placeholder="you@company.com"
                      autoComplete="email" value={email}
                      onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  {otpError && <p className="auth-error">{otpError}</p>}
                  <button type="submit" className="auth-submit"
                    disabled={!isEmailValid || otpSending}>
                    {otpSending ? "Sending…" : "Send code →"}
                  </button>
                </form>

                <button type="button" className="fp-back-step" onClick={goBackToLogin}>
                  ← Back to sign in
                </button>
              </>
            )}

            {/* ════════════ RESET PASSWORD STEP (3-field) ════════════ */}
            {/*
              Reached after the user submits their email on the
              `forgot-email` step. Backend has just reset the password to a
              freshly-generated temporary password and emailed it. User types:
                - that temporary password
                - their chosen new password
                - confirmation
              Submit chains: signIn(temp) → /api/auth/me/set-password →
              re-signIn(new) → navigate. See `submitResetPassword`.
            */}
            {authStep === "forgot-otp" && (
              <>
                <h1>Reset your password</h1>
                <p className="auth-sub">
                  We sent a temporary password to <strong>{email}</strong>.
                </p>

                <form onSubmit={submitResetPassword} noValidate>
                  <div className="auth-field">
                    <label htmlFor="reset-temp">Temporary password</label>
                    <div className="auth-password">
                      <input
                        id="reset-temp"
                        type={showTempPassword ? "text" : "password"}
                        placeholder="From your email"
                        autoComplete="one-time-code"
                        value={tempPassword}
                        onChange={(e) => setTempPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-eye"
                        onClick={() => setShowTempPassword((v) => !v)}
                        aria-label={
                          showTempPassword ? "Hide temporary password" : "Show temporary password"
                        }
                      >
                        {showTempPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="auth-field">
                    <label htmlFor="reset-new">New password</label>
                    <div className="auth-password">
                      <input
                        id="reset-new"
                        ref={newPasswordInputRef}
                        type={showNewPassword ? "text" : "password"}
                        placeholder="minimum 8 characters"
                        autoComplete="new-password"
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-eye"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? "Hide password" : "Show password"}
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {newPassword.length > 0 && newPassword.length < 8 && (
                      <p className="auth-error">Must be at least 8 characters.</p>
                    )}
                  </div>

                  <div className="auth-field">
                    <label htmlFor="reset-confirm">Confirm new password</label>
                    <div className="auth-password">
                      <input
                        id="reset-confirm"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="re-enter password"
                        autoComplete="new-password"
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                    {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                      <p className="auth-error">Passwords don&apos;t match.</p>
                    )}
                  </div>

                  {resetError && <p className="auth-error">{resetError}</p>}

                  <button
                    type="submit"
                    className="auth-submit"
                    disabled={
                      resetSubmitting ||
                      tempPassword.trim().length === 0 ||
                      newPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                  >
                    {resetSubmitting ? "Updating…" : "Reset password →"}
                  </button>
                </form>

                <div className="fp-resend" style={{ marginTop: 16 }}>
                  Didn&apos;t receive it?{" "}
                  <button
                    type="button"
                    className="fp-resend-btn"
                    disabled={otpSending || otpSecondsLeft > 0}
                    onClick={sendOtp}
                  >
                    {otpSending
                      ? "Sending…"
                      : otpSecondsLeft > 0
                      ? `Resend in ${formatCountdown(otpSecondsLeft)}`
                      : "Resend temporary password"}
                  </button>
                </div>

                <button
                  type="button"
                  className="fp-back-step"
                  onClick={() => {
                    setAuthStep("forgot-email");
                    setTempPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setOtpDigits(["", "", "", "", "", ""]);
                    setOtpError(null);
                    setOtpExpiresAt(null);
                    setResetError(null);
                  }}
                >
                  ← Use a different email
                </button>
              </>
            )}

            {/* ════════════ NEW PASSWORD STEP ════════════ */}
            {authStep === "new-password" && (
              <>
                <h1>Set a new password</h1>
                <p className="auth-sub">Choose a strong password with at least 8 characters.</p>

                <form onSubmit={submitNewPassword} noValidate>
                  <div className="auth-field">
                    <label htmlFor="np-password">New password</label>
                    <div className="auth-password">
                      <input id="np-password" ref={newPasswordInputRef}
                        type={showNewPassword ? "text" : "password"}
                        placeholder="minimum 8 characters"
                        autoComplete="new-password" minLength={8}
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                      <button type="button" className="auth-eye"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? "Hide password" : "Show password"}>
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="auth-field">
                    <label htmlFor="np-confirm">Confirm password</label>
                    <div className="auth-password">
                      <input id="np-confirm"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="re-enter password"
                        autoComplete="new-password" minLength={8}
                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </div>
                  </div>

                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="auth-error">Passwords don&apos;t match.</p>
                  )}
                  {resetError && <p className="auth-error">{resetError}</p>}

                  <button type="submit" className="auth-submit"
                    disabled={!isNewPasswordValid || resetSubmitting}>
                    {resetSubmitting ? "Updating…" : "Update password →"}
                  </button>
                </form>

                <button type="button" className="fp-back-step" onClick={goBackToLogin}>
                  ← Cancel
                </button>
              </>
            )}

            {/* ════════════ INVITATION STEP ════════════ */}
            {authStep === "invitation" && (
              <>
                {invitationLoading ? (
                  <>
                    <h1>Loading invitation…</h1>
                    <p className="auth-sub">Please wait while we verify your invite.</p>
                  </>
                ) : invitationError ? (
                  <>
                    <h1>Invitation problem</h1>
                    <p className="auth-sub">{invitationError}</p>
                    <button type="button" className="auth-submit"
                      onClick={() => { if (hardNavigate) window.location.assign("/login"); else router.push("/login"); }}>
                      Go to sign in
                    </button>
                  </>
                ) : (
                  <>
                    <h1>Welcome to {invitationData?.orgName ?? brandName}</h1>
                    <p className="auth-sub">
                      Hi {invitationData?.firstName || "there"}, set your password to activate your account at <strong>{invitationData?.email}</strong>.
                    </p>

                    <form onSubmit={submitInvitation} noValidate>
                      <div className="auth-field">
                        <label htmlFor="inv-current">Current (temporary) password</label>
                        <div className="auth-password">
                          <input id="inv-current"
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="default password from your invite email"
                            autoComplete="current-password"
                            value={inviteCurrentPassword}
                            onChange={(e) => setInviteCurrentPassword(e.target.value)} />
                        </div>
                      </div>

                      <div className="auth-field">
                        <label htmlFor="inv-new">New password</label>
                        <div className="auth-password">
                          <input id="inv-new"
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="min 8 chars, 1 uppercase, 1 number, 1 special"
                            autoComplete="new-password" minLength={8} maxLength={200}
                            value={inviteNewPassword}
                            onChange={(e) => setInviteNewPassword(e.target.value)} />
                          <button type="button" className="auth-eye"
                            onClick={() => setInviteShowPassword((v) => !v)}
                            aria-label={inviteShowPassword ? "Hide password" : "Show password"}>
                            {inviteShowPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>

                      <div className="auth-field">
                        <label htmlFor="inv-confirm">Confirm new password</label>
                        <div className="auth-password">
                          <input id="inv-confirm"
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="re-enter password"
                            autoComplete="new-password" minLength={8} maxLength={200}
                            value={inviteConfirmPassword}
                            onChange={(e) => setInviteConfirmPassword(e.target.value)} />
                        </div>
                      </div>

                      {inviteConfirmPassword.length > 0 && inviteNewPassword !== inviteConfirmPassword && (
                        <p className="auth-error">Passwords don&apos;t match.</p>
                      )}
                      {inviteFormError && <p className="auth-error">{inviteFormError}</p>}

                      <button type="submit" className="auth-submit" disabled={inviteSubmitting}>
                        {inviteSubmitting ? "Saving…" : "Save & Continue →"}
                      </button>
                      <button type="button" className="auth-secondary"
                        onClick={skipInvitation} disabled={inviteSubmitting}>
                        Skip for now
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
