// Apply the saved (or system) theme before first paint — no light flash.
// A file rather than an inline script so the Content Security Policy can
// forbid inline scripts entirely.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();
