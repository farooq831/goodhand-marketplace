import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
});
