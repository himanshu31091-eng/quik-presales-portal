"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowLeft, Eye, EyeOff, Sun, Moon, ChevronDown } from "lucide-react";

/**
 * Self-serve workspace registration — two-panel layout mirroring the central
 * login (left brand panel + right form). Three internal steps:
 *   1. workspace : full name + email + org name  → POST /api/auth/register
 *   2. otp       : 6-digit code (5-min expiry)   → POST /api/auth/verify-otp
 *   3. password  : set + confirm password        → POST /api/auth/register/complete
 * On success we auto sign-in (credentials) and land on the launcher /apps.
 *
 * The brand panel (eyebrow / title / subtitle / description) and the form copy
 * both change per step; the testimonial carousel shows only on the first step.
 */

const OTP_LENGTH = 6;
const OTP_WINDOW_SECONDS = 300; // 5 minutes
const BRAND_NAME = "QuikIT";

const LAUNCHER_URL = (
  process.env.NEXT_PUBLIC_LAUNCHER_URL ??
  process.env.NEXT_PUBLIC_QUIKIT_URL ??
  "http://localhost:3001"
).replace(/\/+$/, "");

type Step = "workspace" | "otp" | "password" | "details";

// Optional onboarding profile options ("A few quick details" step). Values are
// stored verbatim; kept in sync with the server-side Zod enums in
// /api/auth/register/profile.
const INDUSTRY_OPTIONS = [
  "Technology / SaaS",
  "Finance & Banking",
  "Healthcare",
  "Retail & E-commerce",
  "Manufacturing",
  "Construction & Real Estate",
  "Education",
  "Professional Services",
  "Other",
];
const ROLE_OPTIONS = [
  "Founder / CEO",
  "Operations",
  "Product / Engineering",
  "Sales / Marketing",
  "HR / People",
  "Finance",
  "IT / Admin",
  "Other",
];
const COMPANY_SIZE_OPTIONS = [
  "1–10 employees",
  "11–50 employees",
  "51–200 employees",
  "201–1,000 employees",
  "1,000+ employees",
];
const USE_CASE_OPTIONS = [
  "CRM & sales",
  "Project & work management",
  "Team collaboration",
  "HR & people",
  "Analytics & reporting",
  "Customer support",
  "A bit of everything",
];

// Left brand-panel copy per step.
const BRAND_COPY: Record<Step, { eyebrow: string; title: string; subtitle: string; desc: string }> = {
  workspace: {
    eyebrow: "Get started free",
    title: "One Business.\nOne Subscription.\nMany Tools.",
    subtitle: "Run Your Business on One Intelligent Platform.",
    desc: `${BRAND_NAME} is an AI-First comprehensive business suite of interconnected apps that replaces disconnected software with one unified platform — bringing AI, automation, and business intelligence together to help your business work smarter, faster, and more efficiently.`,
  },
  otp: {
    eyebrow: "Almost there",
    title: "Verify your email.",
    subtitle: "One quick step to secure your workspace.",
    desc: `We've sent a 6-digit verification code to your email address. Enter it to finish creating your ${BRAND_NAME} workspace.`,
  },
  password: {
    eyebrow: "Last step",
    title: "Create your password.",
    subtitle: "Secure your new workspace.",
    desc: `Choose a strong password — you'll use it together with your email to sign in to ${BRAND_NAME}.`,
  },
  details: {
    eyebrow: "Almost set up",
    title: "Tell us a bit about\nyour business.",
    subtitle: `So we can tailor ${BRAND_NAME} to the way you work.`,
    desc: "A few quick details help us personalize your workspace and recommend the right apps from day one.",
  },
};

// Right form-panel copy per step.
const FORM_COPY: Record<Step, { heading: string; sub: string; submit: string; busy: string }> = {
  workspace: {
    heading: "Create your workspace",
    sub: "Start free — no credit card required.",
    submit: "Create workspace",
    busy: "Sending code…",
  },
  otp: {
    heading: "Enter verification code",
    sub: "We sent a 6-digit code to your email. Enter it below to finish creating your workspace.",
    submit: "Verify & create workspace",
    busy: "Verifying…",
  },
  password: {
    heading: "Create a password",
    sub: "Choose a strong password to secure your account.",
    submit: "Create password & continue",
    busy: "Setting up your workspace…",
  },
  details: {
    heading: "A few quick details",
    sub: "This helps us personalize your workspace and suggest the right apps.",
    submit: "Continue",
    busy: "Saving…",
  },
};

// Social proof shown in the brand panel's rotating testimonial carousel
// (first step only).
const TESTIMONIALS = [
  { quote: "Every department now works from the same source of truth. Sales, Projects, HR, and Support finally speak the same language.", name: "Priya Sharma", role: "COO · Northwind Retail", initials: "PS" },
  { quote: "We replaced five disconnected tools and cut our software costs by nearly 40% in the first quarter on QuikIT.", name: "Daniel Okafor", role: "Head of Ops · Meridian Logistics", initials: "DO" },
  { quote: "Onboarding took an afternoon, not a month. The AI actually understands how our business runs.", name: "Aisha Lund", role: "Founder · Brightscale", initials: "AL" },
  { quote: "One login, every tool. Our team stopped context-switching and started shipping.", name: "Marco Chen", role: "VP Product · Deltaform", initials: "MC" },
];

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("workspace");

  // Dark by default (matches the redesigned login); the sun/moon control flips
  // it to a light variant via scoped CSS tokens.
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [secondsLeft, setSecondsLeft] = useState(OTP_WINDOW_SECONDS);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [justResent, setJustResent] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // "A few quick details" onboarding step — all optional.
  const [industry, setIndustry] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [primaryUseCase, setPrimaryUseCase] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Testimonial carousel (one card at a time, sliding, with next-card peek).
  const testiViewportRef = useRef<HTMLDivElement>(null);
  const [testiIndex, setTestiIndex] = useState(0);
  const [testiStep, setTestiStep] = useState(0);

  const expired = secondsLeft <= 0;
  const otpValue = useMemo(() => otp.join(""), [otp]);

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  // Measure the carousel viewport so the slide step (card width 88% + gap) is
  // correct regardless of panel width, and keep it in sync on resize.
  useEffect(() => {
    const vp = testiViewportRef.current;
    if (!vp) return;
    const measure = () => setTestiStep(vp.clientWidth * 0.88 + 16);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [step]);

  useEffect(() => {
    const t = setInterval(
      () => setTestiIndex((i) => (i + 1) % TESTIMONIALS.length),
      5000,
    );
    return () => clearInterval(t);
  }, []);

  function resetOtpState() {
    setOtp(Array(OTP_LENGTH).fill(""));
    setSecondsLeft(OTP_WINDOW_SECONDS);
    setResetToken(null);
  }

  async function handleCreateWorkspace(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, email, organizationName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Could not start registration.");
        return;
      }
      resetOtpState();
      setStep("otp");
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function setOtpDigit(idx: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    setOtp(next);
    otpRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (otpValue.length !== OTP_LENGTH) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (expired) {
      setError("This code has expired. Please resend a new one.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp: otpValue }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        setError(body.error || "Invalid or expired code.");
        setOtp(Array(OTP_LENGTH).fill(""));
        otpRefs.current[0]?.focus();
        return;
      }
      setResetToken(body.resetToken);
      setStep("password");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setSubmitting(true);
    try {
      await fetch("/api/auth/register/resend-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      resetOtpState();
      setJustResent(true);
      setTimeout(() => setJustResent(false), 2500);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setError("Could not resend the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!resetToken) {
      setError("Your verification expired. Please start again.");
      setStep("workspace");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetToken, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        setError(body.error || "Could not finish setting up your workspace.");
        if (res.status === 400) setStep("workspace");
        return;
      }
      // Establish the session WITHOUT navigating so the optional
      // "A few quick details" step can save to the user's workspace, then
      // advance to it. If sign-in somehow fails, fall back to the original
      // redirect-to-launcher behaviour so registration never dead-ends.
      const signInRes = await signIn("credentials", { email, password, redirect: false });
      if (signInRes?.error || !signInRes?.ok) {
        await signIn("credentials", { email, password, callbackUrl: `${LAUNCHER_URL}/apps` });
        return;
      }
      setStep("details");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Final navigation to the launcher — mirrors the sign-in component's
  // post-login handoff: a cross-origin target routes through /api/post-login so
  // a handoff JWT is minted and the launcher can plant a host-scoped session
  // cookie (a direct cross-origin assign would land the user unauthenticated).
  function goToLauncher() {
    const target = `${LAUNCHER_URL}/apps`;
    try {
      const targetUrl = new URL(target, window.location.origin);
      if (targetUrl.origin !== window.location.origin) {
        const bridge = new URL("/api/post-login", window.location.origin);
        bridge.searchParams.set("callbackUrl", targetUrl.toString());
        window.location.assign(bridge.toString());
        return;
      }
    } catch {
      /* fall through to a plain assign */
    }
    window.location.assign(target);
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          industry: industry || null,
          jobRole: jobRole || null,
          companySize: companySize || null,
          primaryUseCase: primaryUseCase || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        setError(body.error || "Could not save your details. You can skip for now.");
        return;
      }
      goToLauncher();
    } catch {
      setError("Network error. You can skip for now.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkipDetails() {
    goToLauncher();
  }

  function handleBack() {
    setError(null);
    if (step === "details") goToLauncher();
    else if (step === "password") setStep("otp");
    else if (step === "otp") setStep("workspace");
    else window.location.href = "/login";
  }

  const brand = BRAND_COPY[step];
  const form = FORM_COPY[step];
  const showTestimonials = step === "workspace";

  return (
    <div className="qk-reg" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: REG_CSS }} />
      <div className="qk-guides" aria-hidden="true">
        <span className="qk-guides__drop qk-guides__drop--left" />
        <span className="qk-guides__drop qk-guides__drop--right" />
      </div>
      <div className="auth-layout">
        {/* ── Left brand panel ── */}
        <aside className="auth-side">
          <div className="auth-side-head">
            <button type="button" className="auth-back" onClick={handleBack} aria-label="Go back">
              <ArrowLeft size={18} />
            </button>
            <div className="auth-brand-content">
              <span className="auth-eyebrow">{brand.eyebrow}</span>
              <h2 className="auth-brand-title">{brand.title}</h2>
              <p className="auth-brand-subtitle">{brand.subtitle}</p>
              <p className="auth-brand-desc">{brand.desc}</p>
            </div>
          </div>

          {/* rotating testimonial carousel — first step only */}
          {showTestimonials && (
            <div className="auth-testi">
              <div className="auth-testi-viewport" ref={testiViewportRef}>
                <div
                  className="auth-testi-track"
                  style={{ transform: `translateX(-${testiIndex * testiStep}px)` }}
                >
                  {TESTIMONIALS.map((t, n) => (
                    <div key={t.name} className="auth-testi-card" aria-hidden={n !== testiIndex}>
                      <p className="auth-testi-quote">&ldquo;{t.quote}&rdquo;</p>
                      <div className="auth-testi-by">
                        <span className="auth-testi-avatar">{t.initials}</span>
                        <span className="auth-testi-person">
                          <span className="auth-testi-name">{t.name}</span>
                          <span className="auth-testi-role">{t.role}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="auth-testi-dots">
                {TESTIMONIALS.map((t, n) => (
                  <button
                    key={t.name}
                    type="button"
                    className={`auth-testi-dot${n === testiIndex ? " is-active" : ""}`}
                    aria-label={`Testimonial ${n + 1}`}
                    onClick={() => setTestiIndex(n)}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Right form panel ── */}
        <main className="auth-main">
          <div className="auth-main-top">
            <a href="/" className="auth-logo" aria-label={BRAND_NAME}>
              {/* Theme-aware QuikIT lockup: dark UI → light (white) logo, light UI → dark logo. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={theme === "dark" ? "/brand/quikit-wordmark-light.svg" : "/brand/quikit-wordmark-dark.svg"}
                alt={BRAND_NAME}
                style={{ height: 24, width: "auto", display: "block" }}
              />
            </a>
            <div className="auth-main-top-right">
              <a href="/login" className="auth-top-link">Sign in</a>
              <button type="button" className="auth-theme"
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>

          <div className="auth-card">
            <h1>{form.heading}</h1>
            <p className="auth-sub">{form.sub}</p>

            {error && <div className="auth-banner">{error}</div>}

            {/* STEP 1 */}
            {step === "workspace" && (
              <form onSubmit={handleCreateWorkspace} noValidate>
                <div className="auth-field">
                  <label htmlFor="reg-name">Full name</label>
                  <input id="reg-name" type="text" autoComplete="name" placeholder="Jane Cooper"
                    value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-email">Work email</label>
                  <input id="reg-email" type="email" autoComplete="email" placeholder="you@company.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-org">Organization name</label>
                  <input id="reg-org" type="text" autoComplete="organization" placeholder="Acme Inc."
                    value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required minLength={2} />
                </div>
                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? form.busy : form.submit}
                </button>
              </form>
            )}

            {/* STEP 2 */}
            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} noValidate>
                <div className="auth-otp" onPaste={handleOtpPaste}>
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      className={`auth-otp-input${d ? " filled" : ""}`}
                      value={d}
                      onChange={(e) => setOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      inputMode="numeric"
                      maxLength={1}
                      aria-label={`Digit ${i + 1}`}
                      disabled={expired}
                    />
                  ))}
                </div>
                {expired && (
                  <p className="auth-resend"><span className="auth-expired">Your code has expired — request a new one.</span></p>
                )}
                <button type="submit" className="auth-submit"
                  disabled={submitting || expired || otpValue.length !== OTP_LENGTH}>
                  {submitting ? form.busy : form.submit}
                </button>
                <p className="auth-resend">
                  Didn&apos;t get a code?{" "}
                  <button type="button" className="auth-resend-btn" onClick={handleResend} disabled={submitting || justResent}>
                    {justResent ? "Code sent ✓" : "Resend"}
                  </button>
                </p>
                <button type="button" className="auth-backstep" onClick={() => setStep("workspace")}>
                  ← Back to details
                </button>
              </form>
            )}

            {/* STEP 3 */}
            {step === "password" && (
              <form onSubmit={handleSetPassword} noValidate>
                <div className="auth-field">
                  <label htmlFor="reg-pass">Password</label>
                  <div className="auth-password">
                    <input id="reg-pass" type={showPassword ? "text" : "password"}
                      autoComplete="new-password" placeholder="minimum 8 characters"
                      value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                    <button type="button" className="auth-eye"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-confirm">Confirm password</label>
                  <div className="auth-password">
                    <input id="reg-confirm" type={showConfirm ? "text" : "password"}
                      autoComplete="new-password" placeholder="re-enter password"
                      value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
                    <button type="button" className="auth-eye"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? "Hide password" : "Show password"}>
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? form.busy : form.submit}
                </button>
                <button type="button" className="auth-backstep" onClick={() => setStep("otp")}>
                  ← Back
                </button>
              </form>
            )}

            {/* STEP 4 — optional "A few quick details" onboarding. All fields
                optional; user can Skip straight to the launcher. */}
            {step === "details" && (
              <form onSubmit={handleSaveDetails} noValidate>
                <div className="auth-field">
                  <label htmlFor="reg-industry">Industry</label>
                  <div className="auth-select-wrap">
                    <select id="reg-industry" className={`auth-select${industry ? "" : " is-empty"}`}
                      value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      <option value="">Select your industry</option>
                      {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronDown className="auth-select-icon" size={18} aria-hidden />
                  </div>
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-role">Your role</label>
                  <div className="auth-select-wrap">
                    <select id="reg-role" className={`auth-select${jobRole ? "" : " is-empty"}`}
                      value={jobRole} onChange={(e) => setJobRole(e.target.value)}>
                      <option value="">Select your role</option>
                      {ROLE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronDown className="auth-select-icon" size={18} aria-hidden />
                  </div>
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-size">Company size</label>
                  <div className="auth-select-wrap">
                    <select id="reg-size" className={`auth-select${companySize ? "" : " is-empty"}`}
                      value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
                      <option value="">Select company size</option>
                      {COMPANY_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronDown className="auth-select-icon" size={18} aria-hidden />
                  </div>
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-usecase">Primary use case</label>
                  <div className="auth-select-wrap">
                    <select id="reg-usecase" className={`auth-select${primaryUseCase ? "" : " is-empty"}`}
                      value={primaryUseCase} onChange={(e) => setPrimaryUseCase(e.target.value)}>
                      <option value="">What will you use {BRAND_NAME} for?</option>
                      {USE_CASE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronDown className="auth-select-icon" size={18} aria-hidden />
                  </div>
                </div>
                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? form.busy : form.submit}
                </button>
                <p className="auth-alt">
                  Prefer to do this later?{" "}
                  <button type="button" className="auth-skip" onClick={handleSkipDetails} disabled={submitting}>
                    Skip for now
                  </button>
                </p>
              </form>
            )}

            {step === "workspace" && (
              <p className="auth-alt">
                Already have an account? <a href="/login">Sign in</a>
              </p>
            )}
          </div>

          {step === "workspace" && (
            <div className="auth-foot auth-foot--terms">
              <span>
                By creating an account, you agree to our{" "}
                <a href="https://www.quikit.ai/legal/terms" target="_blank" rel="noopener noreferrer">
                  Terms &amp; Service
                </a>
                .
              </span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const REG_CSS = `
/* ── Design tokens (dark by default; light via [data-theme=light]) ── */
.qk-reg {
  --bg:#050505; --panel-bg:#0c0c0c; --card-bg:#101010; --card-border:#242424;
  --brand-bg:#161616; --brand-border:#262626;
  --text-primary:#f4f4f4; --text-muted:#9a9a9a;
  --hairline:rgba(255,255,255,0.12); --surface:rgba(255,255,255,0.04);
  --line:rgba(255,255,255,0.06); --beam:rgba(255,255,255,0.55); --beam-glow:rgba(255,255,255,0.18);
  --cta-sheen:rgba(0,0,0,0.30); --error:#e0736b;
}
.qk-reg[data-theme="light"] {
  --bg:#f4f3ef; --panel-bg:#ffffff; --card-bg:#ffffff; --card-border:#e4e2dc;
  --brand-bg:#ffffff; --brand-border:#e4e2dc;
  --text-primary:#0f0f0f; --text-muted:#5c5a55;
  --hairline:rgba(0,0,0,0.12); --surface:rgba(0,0,0,0.03);
  --line:rgba(0,0,0,0.08); --beam:rgba(0,0,0,0.3); --beam-glow:rgba(0,0,0,0.08);
  --cta-sheen:rgba(255,255,255,0.55); --error:#c0392b;
}
.qk-reg, .qk-reg *, .qk-reg *::before, .qk-reg *::after { box-sizing:border-box; }
.qk-reg { font-family:'Gilroy','Helvetica Neue',Arial,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:var(--bg); color:var(--text-primary); -webkit-font-smoothing:antialiased; min-height:100vh; min-height:100dvh; padding:2%; display:flex; }
.qk-reg a { text-decoration:none; color:inherit; }
.qk-reg img { display:block; max-width:100%; }
/* Animated background guides (vertical hairlines + falling beams) */
.qk-reg .qk-guides { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
.qk-reg .qk-guides::before, .qk-reg .qk-guides::after { content:""; position:absolute; top:0; bottom:0; width:1px; background:var(--line); }
.qk-reg .qk-guides::before { left:12%; }
.qk-reg .qk-guides::after { right:12%; }
.qk-reg .qk-guides__drop { position:absolute; top:0; width:1px; height:90px; background:linear-gradient(to bottom, transparent 0%, transparent 10%, var(--beam) 100%); opacity:0.65; box-shadow:0 0 6px 0.5px var(--beam-glow); animation:qkGuideFall 6s linear infinite; }
.qk-reg .qk-guides__drop--left { left:12%; }
.qk-reg .qk-guides__drop--right { right:12%; animation-delay:3s; }
@keyframes qkGuideFall { 0% { transform:translateY(-120px); opacity:0; } 8% { opacity:0.55; } 92% { opacity:0.55; } 100% { transform:translateY(100vh); opacity:0; } }
@media (prefers-reduced-motion: reduce) { .qk-reg .qk-guides__drop { display:none; } }

/* ── Split layout ── */
.qk-reg .auth-layout { position:relative; z-index:1; flex:1; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,480px); gap:16px; min-height:0; }

/* ── Left brand panel ── */
.qk-reg .auth-side { position:relative; overflow:hidden; background:var(--brand-bg); border:1px solid var(--brand-border); color:var(--text-primary); padding:44px; display:flex; flex-direction:column; justify-content:space-between; border-radius:24px; }
.qk-reg .auth-back { width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:var(--surface); border:1px solid var(--hairline); color:var(--text-primary); cursor:pointer; -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); transition:background .16s ease, transform .1s ease; }
.qk-reg .auth-back:hover { background:var(--hairline); }
.qk-reg .auth-back:active { transform:scale(0.94); }
.qk-reg .auth-back svg { width:18px; height:18px; }
.qk-reg .auth-side-head { display:flex; flex-direction:column; gap:28px; position:relative; z-index:1; }
.qk-reg .auth-eyebrow { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:var(--text-muted); }
.qk-reg .auth-brand-title { margin-top:16px; font-size:clamp(30px,3.4vw,46px); line-height:1.08; font-weight:400; letter-spacing:-0.02em; color:var(--text-primary); white-space:pre-line; }
.qk-reg .auth-brand-subtitle { margin-top:22px; font-size:17px; font-weight:500; line-height:1.4; letter-spacing:-0.01em; color:var(--text-primary); }
.qk-reg .auth-brand-desc { margin-top:14px; max-width:46ch; font-size:14.5px; line-height:1.6; color:var(--text-muted); }

/* ── Testimonial carousel ── */
.qk-reg .auth-testi { margin-top:24px; position:relative; z-index:1; }
.qk-reg .auth-testi-viewport { overflow:hidden; -webkit-mask-image:linear-gradient(90deg,#000 0,#000 90%,transparent 100%); mask-image:linear-gradient(90deg,#000 0,#000 90%,transparent 100%); }
.qk-reg .auth-testi-track { display:flex; gap:16px; align-items:stretch; transition:transform .55s cubic-bezier(0.22,1,0.36,1); }
.qk-reg .auth-testi-card { flex:0 0 88%; min-width:0; min-height:168px; display:flex; flex-direction:column; padding:26px 28px; border:1px solid var(--hairline); border-radius:16px; background:var(--surface); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); transition:opacity .45s ease; }
.qk-reg .auth-testi-card[aria-hidden="true"] { opacity:0.4; }
.qk-reg .auth-testi-quote { font-size:16px; line-height:1.55; color:var(--text-primary); }
.qk-reg .auth-testi-by { margin-top:auto; padding-top:16px; display:flex; align-items:center; gap:10px; }
.qk-reg .auth-testi-avatar { flex-shrink:0; width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:var(--surface); border:1px solid var(--hairline); font-size:12px; font-weight:600; letter-spacing:0.02em; color:var(--text-primary); }
.qk-reg .auth-testi-person { display:flex; flex-direction:column; gap:1px; min-width:0; }
.qk-reg .auth-testi-name { font-size:14px; font-weight:500; color:var(--text-primary); }
.qk-reg .auth-testi-role { font-size:12px; color:var(--text-muted); }
.qk-reg .auth-testi-dots { margin-top:16px; display:flex; gap:8px; }
.qk-reg .auth-testi-dot { width:7px; height:7px; padding:0; border:none; border-radius:999px; background:var(--hairline); cursor:pointer; transition:background .2s ease, width .2s ease; }
.qk-reg .auth-testi-dot.is-active { width:22px; background:var(--text-primary); }
@media (prefers-reduced-motion: reduce) { .qk-reg .auth-testi-track { transition:none; } }

/* ── Right form panel ── */
.qk-reg .auth-main { display:flex; flex-direction:column; padding:28px 40px; background:var(--card-bg); border:1px solid var(--card-border); overflow:auto; border-radius:24px; }
.qk-reg .auth-main-top { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:8px; flex-shrink:0; }
.qk-reg .auth-logo { font-size:19px; font-weight:700; letter-spacing:-0.01em; color:var(--text-primary); }
.qk-reg .auth-main-top-right { display:flex; align-items:center; gap:14px; }
.qk-reg .auth-top-link { font-size:13px; color:var(--text-muted); text-decoration:underline; text-underline-offset:3px; }
.qk-reg .auth-top-link:hover { color:var(--text-primary); }
.qk-reg .auth-theme { width:40px; height:40px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:var(--surface); border:1px solid var(--hairline); color:var(--text-primary); cursor:pointer; -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); transition:background .16s ease, transform .1s ease; }
.qk-reg .auth-theme:hover { background:var(--hairline); }
.qk-reg .auth-theme:active { transform:scale(0.94); }
.qk-reg .auth-theme svg { width:18px; height:18px; }
.qk-reg .auth-card { width:100%; max-width:400px; margin:auto; padding:32px 0; }
.qk-reg .auth-card h1 { font-size:26px; font-weight:400; letter-spacing:-0.02em; text-align:center; margin-bottom:0; color:var(--text-primary); }
.qk-reg .auth-card .auth-sub { font-size:14px; color:var(--text-muted); text-align:center; margin:10px 0 26px; line-height:1.6; }
.qk-reg .auth-field { margin-bottom:14px; }
.qk-reg .auth-field label { display:block; font-size:14px; font-weight:400; color:var(--text-primary); margin-bottom:8px; }
.qk-reg .auth-field input { width:100%; height:50px; padding:0 16px; font-family:inherit; font-size:15px; color:var(--text-primary); background:var(--card-bg); border:1px solid var(--hairline); border-radius:12px; transition:border-color .15s, background .15s; outline:none; }
.qk-reg .auth-field input::placeholder { color:var(--text-muted); opacity:1; }
.qk-reg .auth-field input:focus { border-color:var(--text-primary); background:var(--panel-bg); }
.qk-reg .auth-field input:-webkit-autofill,
.qk-reg .auth-field input:-webkit-autofill:hover,
.qk-reg .auth-field input:-webkit-autofill:active { -webkit-text-fill-color:var(--text-primary); caret-color:var(--text-primary); -webkit-box-shadow:0 0 0 1000px var(--card-bg) inset; box-shadow:0 0 0 1000px var(--card-bg) inset; transition:background-color 9999s ease-out 0s; }
.qk-reg .auth-field input:-webkit-autofill:focus { -webkit-box-shadow:0 0 0 1000px var(--panel-bg) inset; box-shadow:0 0 0 1000px var(--panel-bg) inset; }
.qk-reg .auth-password { position:relative; }
.qk-reg .auth-password input { padding-right:46px; }
.qk-reg .auth-eye { position:absolute; right:8px; top:50%; transform:translateY(-50%); width:34px; height:34px; background:transparent; border:none; cursor:pointer; color:var(--text-muted); display:flex; align-items:center; justify-content:center; border-radius:8px; transition:color .15s, background .15s; }
.qk-reg .auth-eye:hover { color:var(--text-primary); background:var(--surface); }
.qk-reg .auth-eye svg { width:18px; height:18px; }
.qk-reg .auth-submit { position:relative; overflow:hidden; isolation:isolate; width:100%; height:48px; padding:0 18px; margin-top:20px; background:var(--text-primary); border:1px solid transparent; border-radius:12px; font-family:inherit; font-size:15px; font-weight:500; letter-spacing:-0.01em; color:var(--bg); cursor:pointer; transition:transform .15s ease, box-shadow .15s ease; }
.qk-reg .auth-submit::before { content:""; position:absolute; top:-60%; bottom:-60%; left:-90%; width:65%; background:linear-gradient(90deg, transparent 0%, var(--cta-sheen) 45%, var(--cta-sheen) 55%, transparent 100%); transform:skewX(-20deg); opacity:0; pointer-events:none; }
.qk-reg .auth-submit:hover:not(:disabled)::before { animation:qkShine 0.85s cubic-bezier(0.3,0.5,0.2,1); }
@keyframes qkShine { 0% { left:-90%; opacity:0; } 10% { opacity:1; } 90% { opacity:1; } 100% { left:150%; opacity:0; } }
@media (prefers-reduced-motion: reduce) { .qk-reg .auth-submit::before { display:none; } }
.qk-reg .auth-submit:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 26px -8px rgba(0,0,0,0.55); }
.qk-reg .auth-submit:active:not(:disabled) { transform:translateY(0); }
.qk-reg .auth-submit:disabled { opacity:.5; cursor:not-allowed; }
.qk-reg .auth-banner { padding:10px 12px; border-radius:12px; background:var(--surface); border:1px solid var(--hairline); color:var(--error); font-size:13px; margin-bottom:16px; }
.qk-reg .auth-alt { text-align:center; margin-top:28px; font-size:13px; color:var(--text-muted); }
.qk-reg .auth-alt a { color:var(--text-primary); font-weight:500; text-decoration:underline; text-underline-offset:3px; }
.qk-reg .auth-foot { display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:24px; font-size:12px; color:var(--text-muted); border-top:1px solid var(--line); flex-shrink:0; }
.qk-reg .auth-foot-links { display:flex; gap:20px; }
.qk-reg .auth-foot a { color:var(--text-muted); }
.qk-reg .auth-foot a:hover { color:var(--text-primary); }
.qk-reg .auth-select-wrap { position:relative; }
.qk-reg .auth-select { width:100%; height:50px; padding:0 42px 0 16px; font-family:inherit; font-size:15px; color:var(--text-primary); background:var(--card-bg); border:1px solid var(--hairline); border-radius:12px; transition:border-color .15s, background .15s; outline:none; cursor:pointer; -webkit-appearance:none; -moz-appearance:none; appearance:none; }
.qk-reg .auth-select:focus { border-color:var(--text-primary); background:var(--panel-bg); }
.qk-reg .auth-select.is-empty { color:var(--text-muted); }
.qk-reg .auth-select option { color:var(--text-primary); background:var(--panel-bg); }
.qk-reg .auth-select-icon { position:absolute; right:14px; top:50%; transform:translateY(-50%); pointer-events:none; color:var(--text-muted); }
.qk-reg .auth-skip { background:none; border:none; padding:0; font:inherit; color:var(--text-primary); text-decoration:underline; text-underline-offset:3px; cursor:pointer; }
.qk-reg .auth-skip:hover { opacity:.8; }
.qk-reg .auth-skip:disabled { opacity:.5; cursor:default; }
.qk-reg .auth-foot--terms { justify-content:center; text-align:center; }
.qk-reg .auth-foot--terms a { color:var(--text-primary); text-decoration:underline; text-underline-offset:2px; }
.qk-reg .auth-foot--terms a:hover { opacity:.8; }
/* ── OTP inputs ── */
.qk-reg .auth-otp { display:grid; grid-template-columns:repeat(6, 1fr); gap:10px; margin-bottom:8px; }
.qk-reg .auth-otp-input { width:100%; aspect-ratio:1 / 1.1; text-align:center; font-family:inherit; font-size:22px; font-weight:500; color:var(--text-primary); background:var(--card-bg); border:1px solid var(--hairline); border-radius:12px; transition:border-color .15s, background .15s; outline:none; }
.qk-reg .auth-otp-input:focus { border-color:var(--text-primary); background:var(--panel-bg); }
.qk-reg .auth-otp-input.filled { border-color:var(--text-primary); background:var(--surface); }
.qk-reg .auth-otp-input:disabled { opacity:.5; cursor:not-allowed; }
.qk-reg .auth-resend { text-align:center; font-size:13px; color:var(--text-muted); margin-top:16px; }
.qk-reg .auth-expired { color:var(--error); }
.qk-reg .auth-resend-btn { background:none; border:none; padding:0; font:inherit; color:var(--text-primary); font-weight:500; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
.qk-reg .auth-resend-btn:disabled { color:var(--text-muted); cursor:not-allowed; text-decoration:none; }
.qk-reg .auth-resend-btn:not(:disabled):hover { color:var(--text-primary); }
.qk-reg .auth-backstep { display:block; margin:16px auto 0; background:none; border:none; padding:0; font:inherit; font-size:13px; color:var(--text-muted); cursor:pointer; }
.qk-reg .auth-backstep:hover { color:var(--text-primary); }
@media (max-width:900px) {
  .qk-reg { padding:14px; }
  .qk-reg .auth-layout { grid-template-columns:1fr; }
  .qk-reg .auth-side { padding:28px 24px; min-height:200px; }
  .qk-reg .auth-side-head { gap:18px; }
  .qk-reg .auth-brand-subtitle, .qk-reg .auth-brand-desc, .qk-reg .auth-testi { display:none; }
  .qk-reg .auth-main { padding:24px 22px; }
  .qk-reg .auth-foot { flex-direction:column; gap:12px; align-items:flex-start; margin-top:32px; }
  .qk-reg .auth-otp { gap:8px; }
  .qk-reg .auth-otp-input { font-size:18px; }
}
@media (max-width:480px) {
  .qk-reg { padding:12px; }
  .qk-reg .auth-layout { gap:12px; }
  .qk-reg .auth-side, .qk-reg .auth-main { border-radius:18px; }
  .qk-reg .auth-card { padding:16px 0; }
  .qk-reg .auth-card h1 { font-size:23px; }
}
`;
