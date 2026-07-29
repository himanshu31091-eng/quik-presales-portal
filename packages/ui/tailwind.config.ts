import type { Config } from "tailwindcss"
import animate from "tailwindcss-animate"

const config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "status-on-track": "var(--color-status-on-track)",
        "status-behind": "var(--color-status-behind)",
        "status-critical": "var(--color-status-critical)",
        "status-complete": "var(--color-status-complete)",
        "status-not-started": "var(--color-status-not-started)",
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        foreground: "var(--color-text-primary)",
        background: "var(--color-bg-primary)",
        accent: {
          50:  "var(--accent-50, #eff6ff)",
          100: "var(--accent-100, #dbeafe)",
          200: "var(--accent-200, #bfdbfe)",
          300: "var(--accent-300, #93c5fd)",
          400: "var(--accent-400, #60a5fa)",
          500: "var(--accent-500, #3b82f6)",
          600: "var(--accent-600, #2563eb)",
          700: "var(--accent-700, #1d4ed8)",
          800: "var(--accent-800, #1e3a5f)",
          900: "var(--accent-900, #172554)",
          DEFAULT: "var(--accent-color, #2563eb)",
        },
      },
      fontFamily: {
        // Primary typeface: Plus Jakarta Sans, injected by each app's root
        // layout via next/font (CSS var `--font-jakarta`). System fallbacks
        // prevent FOUT artefacts on slow networks.
        sans: [
          "var(--font-jakarta)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: "var(--font-family-display)",
        body: "var(--font-family-body)",
        mono: "var(--font-family-mono)",
      },
      fontSize: {
        xs: "var(--font-size-xs)",
        sm: "var(--font-size-sm)",
        base: "var(--font-size-base)",
        lg: "var(--font-size-lg)",
        xl: "var(--font-size-xl)",
        "2xl": "var(--font-size-2xl)",
        "3xl": "var(--font-size-3xl)",
        "4xl": "var(--font-size-4xl)",
      },
      spacing: {
        xs: "var(--space-xs)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        "2xl": "var(--space-2xl)",
        "3xl": "var(--space-3xl)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },
      transitionDuration: {
        fast: "var(--transition-fast)",
        normal: "var(--transition-normal)",
        slow: "var(--transition-slow)",
      },
      zIndex: {
        dropdown: "var(--z-dropdown)",
        sticky: "var(--z-sticky)",
        fixed: "var(--z-fixed)",
        "modal-backdrop": "var(--z-modal-backdrop)",
        modal: "var(--z-modal)",
        popover: "var(--z-popover)",
        toast: "var(--z-toast)",
      },
    },
  },
  plugins: [animate],
} satisfies Config

export default config
