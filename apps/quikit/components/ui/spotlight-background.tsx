"use client";

/**
 * SpotlightBackground — animated radial-gradient spotlights drifting across
 * a dark stage. Used on the App Launcher (/apps) for the "select org" feel.
 *
 * Adapted from a paste that supplied JS but not the CSS — styles live below
 * via a <style jsx global> block so the component is self-contained.
 *
 * Three spotlights (left/mid/right) animate independently for an organic
 * non-repeating feel. Animation cancels for users with prefers-reduced-motion.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface SpotlightBackgroundProps {
  children?: ReactNode;
  /** Override the dark base background color. Default: a near-black zinc. */
  bg?: string;
}

export default function SpotlightBackground({ children, bg }: SpotlightBackgroundProps) {
  return (
    <div className="spotlight-container" style={bg ? { backgroundColor: bg } : undefined}>
      <div className="spotlight-overlay" aria-hidden="true">
        <motion.div
          className="spotlight spotlight-left"
          initial={{ x: "-50%", y: "-50%", rotate: "0deg" }}
          animate={{
            x: ["-50%", "-30%", "-70%", "-50%"],
            y: ["-50%", "-70%", "-30%", "-50%"],
            rotate: ["0deg", "15deg", "-15deg", "0deg"],
          }}
          transition={{
            duration: 12,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "mirror",
          }}
        />

        <motion.div
          className="spotlight spotlight-mid"
          initial={{ x: "0%", y: "0%", rotate: "0deg" }}
          animate={{
            x: ["0%", "20%", "-20%", "0%"],
            y: ["0%", "30%", "10%", "0%"],
            rotate: ["-20deg", "0deg", "20deg", "-20deg"],
          }}
          transition={{
            duration: 15,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "mirror",
            delay: 3,
          }}
        />

        <motion.div
          className="spotlight spotlight-right"
          initial={{ x: "0%", y: "0%", rotate: "10deg" }}
          animate={{
            x: ["0%", "-30%", "10%", "0%"],
            y: ["0%", "-20%", "20%", "0%"],
            rotate: ["10deg", "-10deg", "25deg", "10deg"],
          }}
          transition={{
            duration: 18,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "mirror",
            delay: 5,
          }}
        />
      </div>

      <div className="spotlight-content">{children}</div>

      <style jsx global>{`
        .spotlight-container {
          position: relative;
          min-height: 100vh;
          width: 100%;
          /* No overflow:hidden here — it would clip dropdowns/menus.
             Spotlight bleed is contained on .spotlight-overlay below. */
          background-color: #09090b; /* zinc-950 */
          isolation: isolate;
        }

        .spotlight-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden; /* keeps the blurred gradients inside the page bounds */
        }

        .spotlight {
          position: absolute;
          width: 70vw;
          height: 70vw;
          max-width: 1200px;
          max-height: 1200px;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.55;
          mix-blend-mode: screen;
          will-change: transform, opacity;
        }

        .spotlight-left {
          top: 0;
          left: 0;
          background: radial-gradient(
            circle,
            rgba(99, 102, 241, 0.55) 0%, /* indigo-500 */
            rgba(99, 102, 241, 0.22) 35%,
            transparent 70%
          );
        }

        .spotlight-mid {
          top: 25%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle,
            rgba(168, 85, 247, 0.5) 0%, /* violet-500 */
            rgba(168, 85, 247, 0.2) 35%,
            transparent 70%
          );
        }

        .spotlight-right {
          top: 10%;
          right: 0;
          background: radial-gradient(
            circle,
            rgba(34, 211, 238, 0.45) 0%, /* cyan-400 */
            rgba(34, 211, 238, 0.18) 35%,
            transparent 70%
          );
        }

        .spotlight-content {
          position: relative;
          z-index: 1;
          min-height: 100vh;
        }

        /* Subtle grain texture so the gradients don't look plastic */
        .spotlight-container::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background-image: radial-gradient(
            rgba(255, 255, 255, 0.015) 1px,
            transparent 1px
          );
          background-size: 4px 4px;
        }

        /* Respect reduced-motion preferences */
        @media (prefers-reduced-motion: reduce) {
          .spotlight {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
