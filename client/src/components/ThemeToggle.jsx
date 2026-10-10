import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const current = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0B1311" : "#0F6E5F");
}

// Light/dark switch. Follows the OS setting until the user picks one, then
// remembers it (the inline script in index.html applies it before paint).
function ThemeToggle() {
  const [theme, setTheme] = useState(current);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event) => {
      let stored = null;
      try { stored = localStorage.getItem("theme"); } catch { /* storage blocked */ }
      if (stored) return; // an explicit choice wins over the OS
      const next = event.matches ? "dark" : "light";
      apply(next);
      setTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    apply(next);
    setTheme(next);
    try { localStorage.setItem("theme", next); } catch { /* storage blocked — still works for this visit */ }
  }

  return (
    <button type="button" onClick={toggle} className="icon-button" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"}>
      {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}

export default ThemeToggle;
