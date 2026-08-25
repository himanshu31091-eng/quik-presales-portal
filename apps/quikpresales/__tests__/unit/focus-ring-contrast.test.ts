import { describe, it, expect } from "vitest";

/**
 * WCAG 1.4.11 (Non-text Contrast) requires a focus indicator to reach 3:1
 * against its background.
 *
 * The accent palette is per-tenant: `applyAccentColor` in
 * packages/ui/components/theme-applier.tsx takes the org's chosen hex and emits
 * each `--accent-*` shade at a FIXED lightness, varying only hue and
 * saturation. That means the contrast of a focus ring depends on which accent
 * the org picked — and the shades are light enough that low-luminance-friendly
 * hues (teal, green) fail badly at the shades that look fine in blue.
 *
 * This test computes the real ratio for every preset the settings screen
 * offers, so "the ring is readable" is an assertion rather than an assumption.
 * It is what proved that the obvious fix (accent-400 → accent-500) would still
 * have failed for teal and green tenants.
 */

/** The presets offered in apps/quikpresales/app/(dashboard)/settings/page.tsx. */
const ACCENT_PRESETS = [
  { hex: "#0066cc", name: "Blue" },
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#7c3aed", name: "Violet" },
  { hex: "#0d9488", name: "Teal" },
  { hex: "#16a34a", name: "Green" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#e11d48", name: "Rose" },
  { hex: "#475569", name: "Slate" },
];

/**
 * Lightness per shade, mirroring applyAccentColor(). accent-700 also bumps
 * saturation by 10, which this accounts for.
 */
const SHADE = {
  400: { l: 62, satBump: 0 },
  500: { l: 50, satBump: 0 },
  600: { l: 42, satBump: 0 },
  700: { l: 32, satBump: 10 },
} as const;

/** The shade every `focus:ring-accent-*` in the shared kit and this app uses. */
const FOCUS_RING_SHADE = 700;

function hexToHsl(hex: string): { h: number; s: number } {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100) };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lum = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n: number) => lum - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rr, gg, bb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

/** Contrast against white, the lightest surface any of these rings sits on. */
function contrastVsWhite(rgb: [number, number, number]): number {
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

function ringContrast(hex: string, shade: keyof typeof SHADE): number {
  const { h, s } = hexToHsl(hex);
  const { l, satBump } = SHADE[shade];
  return contrastVsWhite(hslToRgb(h, Math.min(s + satBump, 100), l));
}

describe("focus ring contrast (WCAG 1.4.11)", () => {
  it.each(ACCENT_PRESETS)("passes 3:1 for the $name accent", ({ hex }) => {
    expect(ringContrast(hex, FOCUS_RING_SHADE)).toBeGreaterThanOrEqual(3);
  });

  it("documents why lighter shades were rejected", () => {
    // Guards the decision itself: if someone "simplifies" the ring back to a
    // lighter shade, this states plainly what breaks and for whom.
    const teal = "#0d9488";
    expect(ringContrast(teal, 400)).toBeLessThan(3);
    expect(ringContrast(teal, 500)).toBeLessThan(3);
    expect(ringContrast(teal, 600)).toBeLessThan(3);
    expect(ringContrast(teal, 700)).toBeGreaterThanOrEqual(3);
  });
});
