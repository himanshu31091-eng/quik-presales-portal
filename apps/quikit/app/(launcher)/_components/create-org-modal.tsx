"use client";

/**
 * CreateOrgModal — "Create Organization" dialog opened from the launcher's
 * profile menu (/apps). Lets an already-authenticated user spin up an
 * additional organisation without leaving the launcher.
 *
 * Full name + Work email are prefilled and read-only (the user only types the
 * organisation name). Submitting POSTs to /api/org/create — no OTP, no password
 * step — and hands the created org back to the launcher via onCreated so it can
 * switch into it. Styling mirrors the launcher's other inline dark modals
 * (see the trial-expired modal in apps/quikit/app/(launcher)/apps/page.tsx).
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Building2 } from "lucide-react";

/* Same dark tokens the /apps page uses, kept local so this component is
   self-contained (no import from the page module). */
const PAPER = "#050505";
const CARD = "#101010";
const INK = "#F4F4F4";
const ACCENT = "#CDB18B";
const MUTED = "#9A9A9A";
const HAIRLINE = "rgba(255,255,255,0.12)";
const MODAL_SHADOW = "0 1px 3px rgba(0,0,0,0.4), 0 30px 70px rgba(0,0,0,0.55)";
const SANS = "'Gilroy', 'Helvetica Neue', Arial, system-ui, -apple-system, sans-serif";
const ease = [0.22, 1, 0.36, 1] as const;

export interface CreatedOrg {
  orgId: string;
  slug: string;
  role: string;
}

export function CreateOrgModal({
  open,
  onClose,
  fullName,
  email,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  fullName: string;
  email: string;
  onCreated: (org: CreatedOrg) => void | Promise<void>;
}) {
  const reduce = useReducedMotion();
  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset transient state each time the modal opens, and focus the org input.
  useEffect(() => {
    if (!open) return;
    setOrgName("");
    setError(null);
    setSubmitting(false);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  // Close on Escape (unless a request is in flight).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  const trimmed = orgName.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 120;

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/org/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName: trimmed }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        setError(j?.error ?? "Could not create the organisation.");
        setSubmitting(false);
        return;
      }
      await onCreated(j.data as CreatedOrg);
      // Parent closes the modal after switching orgs; keep the button disabled
      // in the meantime so a double-submit can't create two orgs.
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const readonlyFieldStyle: React.CSSProperties = {
    border: `1px solid ${HAIRLINE}`,
    background: "rgba(255,255,255,0.02)",
    color: MUTED,
    borderRadius: 12,
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease }}
          className="fixed inset-0 z-[2000] flex items-center justify-center px-4"
          style={{ background: "rgba(13,17,23,0.45)", backdropFilter: "blur(2px)" }}
          onClick={() => !submitting && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-org-title"
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md p-7"
            style={{ background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 24, boxShadow: MODAL_SHADOW }}
          >
            <div className="flex items-center gap-3 mb-1">
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(205,177,139,0.16)",
                  color: ACCENT,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h3 id="create-org-title" style={{ fontFamily: SANS, fontSize: 22, color: INK, lineHeight: 1.15 }}>
                  Create organization
                </h3>
                <p style={{ fontSize: 13, color: MUTED }}>Start free — no credit card required.</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 6 }}>Full name</label>
                <input
                  type="text"
                  value={fullName}
                  readOnly
                  disabled
                  aria-label="Full name"
                  className="w-full px-3.5 py-2.5 text-sm focus:outline-none cursor-not-allowed"
                  style={readonlyFieldStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 6 }}>Work email</label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  disabled
                  aria-label="Work email"
                  className="w-full px-3.5 py-2.5 text-sm focus:outline-none cursor-not-allowed"
                  style={readonlyFieldStyle}
                />
              </div>

              <div>
                <label
                  htmlFor="create-org-name"
                  style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 6 }}
                >
                  Organization name
                </label>
                <input
                  id="create-org-name"
                  ref={inputRef}
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Inc."
                  maxLength={120}
                  disabled={submitting}
                  className="w-full px-3.5 py-2.5 text-sm focus:outline-none"
                  style={{ border: `1px solid ${HAIRLINE}`, background: PAPER, color: INK, borderRadius: 12 }}
                />
              </div>

              {error && (
                <p role="alert" style={{ fontSize: 13, color: "#F87171" }}>
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm transition-colors disabled:opacity-60"
                  style={{ fontWeight: 700, color: INK, background: PAPER, border: `1px solid ${HAIRLINE}`, borderRadius: 12 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!valid || submitting}
                  className="px-5 py-2.5 text-sm transition-colors disabled:opacity-50"
                  style={{ fontWeight: 700, color: PAPER, background: INK, borderRadius: 12 }}
                >
                  {submitting ? "Creating…" : "Create workspace"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
