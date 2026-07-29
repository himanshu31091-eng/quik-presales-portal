"use client";

/**
 * Billing / Upgrade — /billing
 *
 * Members (org admins) land here from the launcher trial pill / upgrade modal.
 * Lists active plans and lets an org admin upgrade. The upgrade is a stub
 * (no payment provider) that flips the org's subscription to active so the
 * trial gate releases end-to-end. Visual language mirrors the launcher.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Check } from "lucide-react";

const PAPER = "#F7F7F4";
const CARD = "#FFFFFF";
const INK = "#0D1117";
const ACCENT = "#CDB18B";
const MUTED = "#6B7280";
const HAIRLINE = "rgba(13,17,23,0.08)";
const SERIF = "'DM Serif Display', Georgia, serif";
const SANS = "'Inter', system-ui, sans-serif";

interface PlanInfo {
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  features: string[];
}

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return "Free";
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${(cents / 100).toLocaleString()}`;
}

export default function BillingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setPlans(j.data as PlanInfo[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(planSlug: string) {
    setError(null);
    setUpgrading(planSlug);
    try {
      const res = await fetch("/api/org/subscription/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: session?.user?.orgId, planSlug }),
      });
      const j = await res.json();
      if (!j.success) {
        setError(j.error || "Upgrade failed.");
        setUpgrading(null);
        return;
      }
      router.push("/apps");
    } catch {
      setError("Network error. Please try again.");
      setUpgrading(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: SANS }}>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <button
          onClick={() => router.push("/apps")}
          className="inline-flex items-center gap-1.5 mb-6"
          style={{ fontSize: 13, fontWeight: 600, color: MUTED }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to apps
        </button>

        <h1 style={{ fontFamily: SERIF, fontSize: 32, color: INK, marginBottom: 6 }}>
          Choose your plan
        </h1>
        <p style={{ fontSize: 14, color: MUTED, marginBottom: 28 }}>
          Upgrade to keep your team running on QuikIT after your free trial.
        </p>

        {error && (
          <div
            className="mb-6 rounded-lg px-3 py-2 text-sm"
            style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C", border: "1px solid rgba(220,38,38,0.2)" }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 14, color: MUTED, padding: "60px 0", textAlign: "center" }}>
            Loading plans…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <div
                key={p.slug}
                className="flex flex-col p-6"
                style={{
                  background: CARD,
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 20,
                  boxShadow: "0 1px 3px rgba(13,17,23,0.04), 0 10px 30px rgba(13,17,23,0.06)",
                }}
              >
                <h3 style={{ fontSize: 18, fontWeight: 700, color: INK }}>{p.name}</h3>
                <p style={{ fontSize: 13, color: MUTED, marginTop: 4, minHeight: 36 }}>
                  {p.description}
                </p>
                <div style={{ margin: "14px 0" }}>
                  <span style={{ fontFamily: SERIF, fontSize: 30, color: INK }}>
                    {formatPrice(p.priceMonthly, p.currency)}
                  </span>
                  {p.priceMonthly > 0 && (
                    <span style={{ fontSize: 13, color: MUTED }}> / month</span>
                  )}
                </div>
                <ul className="flex-1 space-y-2 mb-5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2" style={{ fontSize: 13, color: INK }}>
                      <Check className="h-4 w-4" style={{ color: ACCENT }} />
                      {f.replace(/_/g, " ")}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(p.slug)}
                  disabled={upgrading !== null}
                  className="w-full py-2.5 text-sm transition-colors disabled:opacity-60"
                  style={{ fontWeight: 700, color: "#fff", background: INK, borderRadius: 12 }}
                >
                  {upgrading === p.slug ? "Upgrading…" : `Choose ${p.name}`}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
