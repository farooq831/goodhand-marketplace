import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// robots.txt is generated at build time so its Sitemap line points at the
// deployed API (VITE_API_URL), where /sitemap.xml is served from live data.
// Private areas are kept out of search engines.
function robotsTxt(apiUrl) {
  return {
    name: "robots-txt",
    generateBundle() {
      const apiOrigin = (apiUrl || "").replace(/\/api\/?$/, "");
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: [
          "User-agent: *",
          "Allow: /",
          "Disallow: /dashboard",
          "Disallow: /checkout",
          "Disallow: /booking",
          "Disallow: /reset-password",
          "Disallow: /verify-email",
          ...(apiOrigin ? ["", `Sitemap: ${apiOrigin}/sitemap.xml`] : []),
          "",
        ].join("\n"),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), robotsTxt(env.VITE_API_URL)],
    server: {
      port: 5173,
    },
    build: {
      rollupOptions: {
        output: {
          // Third-party code changes far less often than the app, so it gets
          // its own long-cached chunks; an app deploy doesn't re-download it.
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            data: ["@tanstack/react-query", "axios", "socket.io-client"],
            icons: ["lucide-react"],
          },
        },
      },
    },
  };
});
