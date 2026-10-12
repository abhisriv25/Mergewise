/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Only the public site uses dark: variants (via a .dark wrapper); the
  // signed-in app is dark by default and has no dark: classes.
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Surfaces are near-black with a faint blue cast; elevation comes
        // from lighter surfaces + hairline borders, not heavy shadows.
        canvas: "#07090e",
        surface: {
          DEFAULT: "#0c1018",
          raised: "#11161f",
          overlay: "#161c27",
        },
        line: {
          DEFAULT: "rgb(148 163 184 / 0.10)",
          strong: "rgb(148 163 184 / 0.18)",
        },
      },
      boxShadow: {
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 8px 24px -12px rgb(0 0 0 / 0.6)",
        glow: "0 0 0 1px rgb(52 211 153 / 0.25), 0 8px 30px -8px rgb(52 211 153 / 0.35)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "blob-drift": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(24px, -18px) scale(1.08)" },
          "66%": { transform: "translate(-18px, 16px) scale(0.94)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "ring-fill": {
          "0%": { strokeDashoffset: "var(--ring-circumference)" },
        },
        "bar-grow": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "logo-pop": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "70%": { transform: "scale(1.18)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "float-in": {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "slide-in-left": "slide-in-left 0.25s cubic-bezier(0.16,1,0.3,1) both",
        "blob-drift": "blob-drift 14s ease-in-out infinite",
        "blob-drift-slow": "blob-drift 20s ease-in-out infinite",
        shake: "shake 0.4s ease-in-out",
        shimmer: "shimmer 1.4s linear infinite",
        "ring-fill": "ring-fill 1s cubic-bezier(0.16,1,0.3,1) both",
        "bar-grow": "bar-grow 0.8s cubic-bezier(0.16,1,0.3,1) both",
        marquee: "marquee 40s linear infinite",
        "logo-pop": "logo-pop 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "float-in": "float-in 0.6s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};
