"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function WatercolorIntro() {
  const pathname = usePathname();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const turbRef = useRef<SVGFETurbulenceElement | null>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    const turb = turbRef.current;
    if (!overlay || !canvas) return;

    // Skip the watercolor intro on mobile (saves ~3.4s LCP and avoids GPU strain)
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      overlay.style.display = "none";
      overlay.style.opacity = "0";
      document.body.classList.remove("wc-active");
      return;
    }

    overlay.style.display = "block";
    overlay.style.opacity = "1";
    overlay.style.backgroundColor = "#F7F7F4";
    overlay.style.transition = "";
    document.body.classList.add("wc-active");

    if (turb) {
      turb.setAttribute("seed", String(Math.floor(Math.random() * 120) + 1));
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let W = 0;
    let H = 0;
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 1.8);
    const maxCornerDist = (ox: number, oy: number) =>
      Math.max(
        Math.hypot(ox, oy),
        Math.hypot(W - ox, oy),
        Math.hypot(ox, H - oy),
        Math.hypot(W - ox, H - oy)
      );

    const drops = [
      { fx: 0.22, fy: 0.2, reach: 1.35, lag: 0.0 },
      { fx: 0.78, fy: 0.32, reach: 1.3, lag: 0.06 },
      { fx: 0.48, fy: 0.78, reach: 1.25, lag: 0.1 },
    ];

    const DURATION = 3400;
    let startTime: number | null = null;
    let raf = 0;
    let cleanupTimer = 0;
    let cancelled = false;

    const frame = (ts: number) => {
      if (cancelled) return;
      if (startTime === null) startTime = ts;
      const progress = Math.min((ts - startTime) / DURATION, 1);

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#F7F7F4";
      ctx.fillRect(0, 0, W, H);
      if (overlay.style.backgroundColor !== "transparent") {
        overlay.style.backgroundColor = "transparent";
      }

      ctx.globalCompositeOperation = "destination-out";
      drops.forEach((d) => {
        const t = Math.max(0, Math.min((progress - d.lag) / (1 - d.lag), 1));
        const e = easeOut(t);
        const ox = d.fx * W;
        const oy = d.fy * H;
        const r = e * maxCornerDist(ox, oy) * d.reach;
        if (r < 1) return;
        const g = ctx.createRadialGradient(ox, oy, r * 0.3, ox, oy, r);
        g.addColorStop(0.0, "rgba(0,0,0,1)");
        g.addColorStop(0.5, "rgba(0,0,0,0.98)");
        g.addColorStop(0.7, "rgba(0,0,0,0.85)");
        g.addColorStop(0.82, "rgba(0,0,0,0.55)");
        g.addColorStop(0.92, "rgba(0,0,0,0.20)");
        g.addColorStop(1.0, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        overlay.style.transition = "opacity 0.45s ease";
        overlay.style.opacity = "0";
        document.body.classList.remove("wc-active");
        cleanupTimer = window.setTimeout(() => {
          if (cancelled) return;
          overlay.style.display = "none";
        }, 550);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(cleanupTimer);
      window.removeEventListener("resize", resize);
      document.body.classList.remove("wc-active");
    };
  }, [pathname]);

  return (
    <>
      <svg
        id="wc-filters"
        aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      >
        <defs>
          <filter
            id="wc-ink"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              ref={turbRef}
              id="wc-turb"
              type="fractalNoise"
              baseFrequency="0.008 0.006"
              numOctaves={5}
              seed={7}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={160}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation={1.5} />
          </filter>
        </defs>
      </svg>
      <div id="wc-overlay" ref={overlayRef}>
        <canvas id="wc-canvas" ref={canvasRef}></canvas>
      </div>
    </>
  );
}
