/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Design.md §5 visual system
        primary: "#0F6E5F",
        accent: "#E8A33D",
        canvas: "#F6F4EE",
        ink: "#18332F",
        muted: "#65736F",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(24, 51, 47, 0.08)",
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
