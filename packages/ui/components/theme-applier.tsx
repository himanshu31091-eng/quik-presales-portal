"use client";

import { useEffect, useState } from "react";

function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function applyAccentColor(hex: string) {
  const hsl = hexToHSL(hex);
  if (!hsl) return;

  const root = document.documentElement;
  const { h, s } = hsl;

  root.style.setProperty("--accent-color", hex);

  // Light shades (for backgrounds, hover states)
  root.style.setProperty("--accent-50", `hsl(${h}, ${Math.min(s + 15, 100)}%, 97%)`);
  root.style.setProperty("--accent-100", `hsl(${h}, ${Math.min(s + 10, 100)}%, 94%)`);
  root.style.setProperty("--accent-200", `hsl(${h}, ${s}%, 86%)`);
  root.style.setProperty("--accent-300", `hsl(${h}, ${s}%, 76%)`);
  root.style.setProperty("--accent-400", `hsl(${h}, ${s}%, 62%)`);

  // Mid tones (for buttons, links)
  root.style.setProperty("--accent-500", `hsl(${h}, ${s}%, 50%)`);
  root.style.setProperty("--accent-600", `hsl(${h}, ${s}%, 42%)`);

  // Dark shades (for dark sidebar, text on light bg)
  root.style.setProperty("--accent-700", `hsl(${h}, ${Math.min(s + 10, 100)}%, 32%)`);
  root.style.setProperty("--accent-800", `hsl(${h}, ${Math.min(s + 15, 100)}%, 22%)`);
  root.style.setProperty("--accent-900", `hsl(${h}, ${Math.min(s + 20, 100)}%, 15%)`);
}

interface ThemeApplierProps {
  apiEndpoint?: string;
  defaultColor?: string;
}

export function ThemeApplier({
  apiEndpoint = "/api/settings/company",
  defaultColor = "#0066cc",
}: ThemeApplierProps) {
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (applied) return;

    (async () => {
      try {
        const res = await fetch(apiEndpoint);
        const json = await res.json();
        if (!json.success) {
          applyAccentColor(defaultColor);
        } else {
          applyAccentColor(json.data.accentColor || defaultColor);
        }
      } catch {
        applyAccentColor(defaultColor);
      }
      setApplied(true);
    })();
  }, [applied, apiEndpoint, defaultColor]);

  return null;
}
