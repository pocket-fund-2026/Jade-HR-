/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ledger: {
          DEFAULT: "#16302A",
          900: "#0F231E",
          800: "#16302A",
          700: "#1F4536",
        },
        manila: "#EFE9DA",
        paper: "#FAF7F0",
        ink: "#1B1B18",
        jade: {
          50: "#EAF4EF",
          100: "#CDE6D8",
          400: "#3E9270",
          500: "#2F7A5E",
          600: "#256349",
          700: "#1B4A37",
        },
        rust: {
          50: "#FBEEE9",
          400: "#C05A3F",
          500: "#A13D2E",
          600: "#832F23",
        },
        ochre: {
          50: "#FBF0E2",
          400: "#DA9548",
          500: "#C97C2E",
          600: "#A6621F",
        },
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        stamp: "0 0 0 1px rgba(27,27,24,0.04), 0 2px 6px -1px rgba(27,27,24,0.12)",
        card: "0 1px 2px rgba(27,27,24,0.06), 0 1px 0 rgba(27,27,24,0.04)",
      },
      backgroundImage: {
        "ledger-weave":
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 6px)",
      },
    },
  },
  plugins: [],
};
