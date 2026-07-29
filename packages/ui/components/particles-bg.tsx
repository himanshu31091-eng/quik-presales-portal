"use client";

import { useEffect, useCallback } from "react";

interface ParticlesBgProps {
  /** Override particle dot color */
  particleColor?: string;
  /** Override link line color */
  lineColor?: string;
  /** Override accent/stroke color */
  accentColor?: string;
  /** CSS class for the container */
  className?: string;
}

export default function ParticlesBg({
  particleColor = "#a78bfa",
  lineColor = "#7c3aed",
  accentColor = "#6d28d9",
  className,
}: ParticlesBgProps) {
  const initParticles = useCallback(
    (pColor: string, lColor: string, aColor: string) => {
      const oldCanvas = document.querySelector("#particles-js canvas");
      if (oldCanvas) oldCanvas.remove();

      // @ts-ignore
      if (window.pJSDom?.length > 0) {
        // @ts-ignore
        window.pJSDom.forEach((p: any) => p.pJS.fn.vendors.destroypJS());
        // @ts-ignore
        window.pJSDom = [];
      }

      // @ts-ignore
      window.particlesJS("particles-js", {
        particles: {
          number: { value: 120, density: { enable: true, value_area: 900 } },
          color: { value: pColor },
          shape: { type: "circle", stroke: { width: 0.5, color: aColor } },
          opacity: {
            value: 0.6,
            random: true,
            anim: { enable: true, speed: 0.8, opacity_min: 0.2 },
          },
          size: {
            value: 2.5,
            random: true,
            anim: { enable: true, speed: 1.5, size_min: 0.8 },
          },
          line_linked: {
            enable: true,
            distance: 150,
            color: lColor,
            opacity: 0.25,
            width: 1,
          },
          move: { enable: true, speed: 1.4, random: true, out_mode: "bounce" },
        },
        interactivity: {
          detect_on: "canvas",
          events: {
            onhover: { enable: true, mode: "grab" },
            onclick: { enable: true, mode: "push" },
            resize: true,
          },
          modes: {
            grab: { distance: 200, line_linked: { opacity: 0.6 } },
            push: { particles_nb: 3 },
            repulse: { distance: 160, duration: 0.4 },
          },
        },
        retina_detect: true,
      });
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js";
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      initParticles(particleColor, lineColor, accentColor);
    };

    return () => {
      // cleanup
      // @ts-ignore
      if (window.pJSDom?.length > 0) {
        // @ts-ignore
        window.pJSDom.forEach((p: any) => p.pJS.fn.vendors.destroypJS());
        // @ts-ignore
        window.pJSDom = [];
      }
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [initParticles, particleColor, lineColor, accentColor]);

  return (
    <div
      id="particles-js"
      className={className ?? "w-full h-screen absolute top-0 left-0"}
    />
  );
}
