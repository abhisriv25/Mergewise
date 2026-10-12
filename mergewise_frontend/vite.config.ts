import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The backend's risk engine is pure (no I/O, no dependencies), so the
      // landing page runs the exact same code in the browser: one source of
      // truth for every rule and point value. Keep in sync with tsconfig paths.
      "@risk-engine": fileURLToPath(new URL("../mergewise_backend/src/risk", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Not strictly required (API calls use full URLs + credentials: "include"
      // already), but convenient if you later want relative fetch("/me") calls.
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
