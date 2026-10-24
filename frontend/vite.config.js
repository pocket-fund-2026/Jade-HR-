import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

// Emits dist/version.json so open tabs can detect a newer deploy (see UpdateBanner).
const versionFile = () => ({
  name: "version-file",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
  },
});

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5210,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
