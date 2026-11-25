/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        white: "rgb(var(--c-white) / <alpha-value>)",
        // Text that sits on a coloured fill: tinted toward that fill's hue, never pure white.
        "on-jade": "rgb(var(--c-on-jade) / <alpha-value>)",
        "on-rust": "rgb(var(--c-on-rust) / <alpha-value>)",
        "on-ochre": "rgb(var(--c-on-ochre) / <alpha-value>)",
        ledger: {
          DEFAULT: "rgb(var(--c-ledger-800) / <alpha-value>)",
          900: "rgb(var(--c-ledger-900) / <alpha-value>)",
          800: "rgb(var(--c-ledger-800) / <alpha-value>)",
          700: "rgb(var(--c-ledger-700) / <alpha-value>)",
        },
        manila: "rgb(var(--c-manila) / <alpha-value>)",
        paper: "rgb(var(--c-paper) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        jade: {
          50: "rgb(var(--c-jade-50) / <alpha-value>)",
          100: "rgb(var(--c-jade-100) / <alpha-value>)",
          400: "rgb(var(--c-jade-400) / <alpha-value>)",
          500: "rgb(var(--c-jade-500) / <alpha-value>)",
          600: "rgb(var(--c-jade-600) / <alpha-value>)",
          700: "rgb(var(--c-jade-700) / <alpha-value>)",
        },
        rust: {
          50: "rgb(var(--c-rust-50) / <alpha-value>)",
          400: "rgb(var(--c-rust-400) / <alpha-value>)",
          500: "rgb(var(--c-rust-500) / <alpha-value>)",
          600: "rgb(var(--c-rust-600) / <alpha-value>)",
        },
        ochre: {
          50: "rgb(var(--c-ochre-50) / <alpha-value>)",
          400: "rgb(var(--c-ochre-400) / <alpha-value>)",
          500: "rgb(var(--c-ochre-500) / <alpha-value>)",
          600: "rgb(var(--c-ochre-600) / <alpha-value>)",
          // 700 exists specifically for text: 500/600 read fine as fills/borders
          // but fail WCAG AA (4.5:1) as text on manila/paper.
          700: "rgb(var(--c-ochre-700) / <alpha-value>)",
        },
      },
      // Fluid type: display sizes scale smoothly between a phone and a wide
      // desktop instead of jumping at breakpoints. Headline sizes (2xl and up)
      // carry a tight 1.15 line height; xl is a sub-heading at 1.25.
      fontSize: {
        xl: ["clamp(1.125rem, 1.04rem + 0.35vw, 1.3125rem)", { lineHeight: "1.25" }],
        "2xl": ["clamp(1.375rem, 1.2rem + 0.7vw, 1.75rem)", { lineHeight: "1.15" }],
        "3xl": ["clamp(1.625rem, 1.35rem + 1.1vw, 2.125rem)", { lineHeight: "1.15" }],
        "4xl": ["clamp(1.875rem, 1.45rem + 1.7vw, 2.625rem)", { lineHeight: "1.1" }],
        "5xl": ["clamp(2.25rem, 1.6rem + 2.6vw, 3.5rem)", { lineHeight: "1.05" }],
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // Layered shadows: a tight contact shadow, a mid shadow and a wide soft
      // one, all tinted with the blue-grey ink so they never read as black.
      boxShadow: {
        stamp:
          "0 0 0 1px rgb(var(--c-shadow) / 0.05), 0 1px 1px rgb(var(--c-shadow) / 0.06), 0 2px 4px -1px rgb(var(--c-shadow) / 0.08), 0 8px 16px -4px rgb(var(--c-shadow) / 0.10)",
        card:
          "0 1px 1px rgb(var(--c-shadow) / 0.04), 0 2px 3px rgb(var(--c-shadow) / 0.05), 0 6px 14px -4px rgb(var(--c-shadow) / 0.07)",
        edge:
          "0 1px 0 rgb(var(--c-shadow) / 0.06), 0 1px 2px rgb(var(--c-shadow) / 0.06), 0 3px 6px -2px rgb(var(--c-shadow) / 0.06)",
        lift:
          "0 1px 1px rgb(var(--c-shadow) / 0.05), 0 4px 8px -2px rgb(var(--c-shadow) / 0.09), 0 14px 28px -8px rgb(var(--c-shadow) / 0.16)",
      },
      backgroundImage: {
        "ledger-weave":
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 6px)",
      },
    },
  },
  plugins: [],
};
