/** @type {import('tailwindcss').Config} */

// Theme-aware colours are CSS variables (space-separated RGB, defined in
// index.css for light and dark) so every existing utility — bg-white,
// text-ink, border-black/5 — adapts to the theme without per-component
// dark: variants. "white" means "surface" and "black" means "line colour".
const themed = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Design.md §5 visual system
        primary: themed("primary"),
        accent: "#E8A33D",
        canvas: themed("canvas"),
        ink: themed("ink"),
        muted: themed("muted"),
        white: themed("surface"),
        black: themed("line"),
        // Fixed colours for surfaces that are dark in both themes (hero
        // banners, the auth side panel) and the text on them.
        night: "#18332F",
        snow: "#FFFFFF",
      },
      boxShadow: {
        soft: "0 18px 50px rgb(var(--c-shadow) / 0.08)",
      },
      fontFamily: {
        // Design.md §5: Inter for UI, Fraunces for headlines only.
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
