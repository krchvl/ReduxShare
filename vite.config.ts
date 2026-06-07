import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const extensionTarget = process.env.REDUXSHARE_BROWSER_TARGET;

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: extensionTarget ? resolve(__dirname, "dist", extensionTarget) : "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
        external: resolve(__dirname, "src/background/external.ts"),
        stealthConsole: resolve(__dirname, "src/content/stealthConsole.ts"),
        quizAttempt: resolve(__dirname, "src/content/quizAttempt.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
          }

          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }

          if (
            (id.includes("src/i18n/") && !id.endsWith("src/i18n/react.tsx")) ||
            id.endsWith("src/types.ts")
          ) {
            return "shared-app";
          }
        }
      }
    }
  }
});
