import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    open: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    exclude: ["src/archive/**"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "charts":       ["recharts"],
          "longScoring":  [
            "./src/scoring/longAbsoluteEntryScore/index.js",
            "./src/audits/bestDnaLongAudit.js",
          ],
          "discovery":    ["./src/aesDiscovery/aesDiscoveryConfig.js"],
        },
      },
    },
  },
});
