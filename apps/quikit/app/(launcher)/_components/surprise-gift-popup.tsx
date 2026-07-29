"use client";

/**
 * Surprise-gift celebration popup. Opens AFTER the gift is claimed and the trial
 * extended — purely celebratory: a banner + party-popper confetti from both
 * bottom corners. Generic across every app (the app name + day count are
 * interpolated), so it works for the whole launcher without per-app assets.
 *
 * Close via the ×, the backdrop, or Esc.
 */

import { useEffect, useRef } from "react";
import { getSurpriseBanner } from "../_data/surprise-gifts";

/** Dependency-free confetti: two bursts from the bottom corners, ~2.8s, then
 *  the canvas removes itself. Returns a cleanup fn (cancels RAF + drops canvas). */
function fireConfetti(): () => void {
  const c = document.createElement("canvas");
  c.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100001";
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext("2d");

  let raf = 0;
  let stopped = false;
  const cleanup = () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    c.remove();
  };
  if (!ctx) return cleanup;

  const cols = ["#9A6217", "#E7C06A", "#2d88ff", "#1F7A3D", "#ffffff", "#ef4444"];
  type P = { x: number; y: number; vx: number; vy: number; g: number; col: string; s: number; rot: number; vr: number };
  const parts: P[] = [];
  const burst = (x: number, ang: number) => {
    for (let i = 0; i < 110; i++) {
      const a = ang + (Math.random() - 0.5) * 0.9;
      const sp = 9 + Math.random() * 10;
      parts.push({
        x,
        y: c.height,
        vx: Math.cos(a) * sp,
        vy: -Math.sin(a) * sp,
        g: 0.18 + Math.random() * 0.12,
        col: cols[(Math.random() * cols.length) | 0],
        s: 5 + Math.random() * 6,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.5,
      });
    }
  };
  burst(0, Math.PI / 3);
  burst(c.width, Math.PI - Math.PI / 3);

  const start = Date.now();
  const loop = () => {
    if (stopped) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.55);
      ctx.restore();
    }
    if (Date.now() - start < 2800) {
      raf = requestAnimationFrame(loop);
    } else {
      cleanup();
    }
  };
  raf = requestAnimationFrame(loop);
  return cleanup;
}

export function SurpriseGiftPopup({
  slug,
  appName,
  onClose,
}: {
  slug: string;
  appName: string;
  onClose: () => void;
}) {
  // App-specific banner image (QuikTrack/CRM/Scale/Infra/Social), or null →
  // generic gradient banner. The copy + format is identical across all apps;
  // only the banner image and the app name change.
  const banner = getSurpriseBanner(slug);

  // Latest onClose without re-firing the mount effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const stopConfetti = fireConfetti();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      stopConfetti();
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      <style>{`
        .sg-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,10,20,0.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);}
        .sg-card{background:#fff;border-radius:20px;width:92vw;max-width:820px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,0.55);animation:sg-pop .35s cubic-bezier(.2,.8,.2,1);position:relative;}
        .sg-x{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;border:none;background:rgba(255,255,255,0.25);color:#fff;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;transition:background .15s;}
        .sg-x:hover{background:rgba(255,255,255,0.45);}
        .sg-banner{flex:none;width:100%;aspect-ratio:19/10;background-color:#f1f2f4;background-position:center;background-size:cover;background-repeat:no-repeat;display:flex;align-items:center;justify-content:center;}
        .sg-banner--generic{background:linear-gradient(135deg,#9A6217 0%,#CDB18B 55%,#E7C06A 100%);}
        .sg-gift{font-size:110px;line-height:1;filter:drop-shadow(0 8px 18px rgba(0,0,0,0.28));}
        .sg-body{flex:0 0 auto;padding:28px 48px 30px;text-align:center;}
        .sg-title{font-size:26px;font-weight:800;letter-spacing:-0.01em;color:#111;margin:0 0 12px;line-height:1.2;}
        .sg-text{font-size:15px;line-height:1.6;color:#6B7280;margin:0;}
        .sg-text strong{color:#9A6217;font-weight:700;}
        @keyframes sg-pop{from{opacity:0;transform:scale(.92) translateY(10px);}to{opacity:1;transform:none;}}
        @media (prefers-reduced-motion: reduce){.sg-card{animation:none;}}
        @media (max-width:640px){.sg-body{padding:20px 22px 24px;}.sg-title{font-size:21px;}.sg-gift{font-size:76px;}}
      `}</style>
      <div
        className="sg-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sg-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="sg-card">
          <button type="button" className="sg-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
          {banner ? (
            <div className="sg-banner" style={{ backgroundImage: `url("${banner}")` }} />
          ) : (
            <div className="sg-banner sg-banner--generic">
              <span className="sg-gift" role="img" aria-label="gift">🎁</span>
            </div>
          )}
          <div className="sg-body">
            <h2 id="sg-title" className="sg-title">A gift for our most valued customer</h2>
            <p className="sg-text">
              Enjoy <strong>1 month of {appName} — absolutely free.</strong> A little thank-you for growing with Quikit.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
