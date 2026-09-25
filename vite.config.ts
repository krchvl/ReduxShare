import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const extensionTarget = process.env.REDUXSHARE_BROWSER_TARGET;
// Content scripts are classic scripts and cannot resolve ES imports, so they are built in a
// separate pass in which everything they import is inlined into the entry file. Any module
// reachable from both an app entry and a content entry would otherwise become a shared chunk.
const contentPass = process.env.REDUXSHARE_BUNDLE === "content";

const entryPoints: Record<string, string> = contentPass
  ? {
      stealthConsole: resolve(__dirname, "src/content/stealthConsole.ts"),
      quizAttempt: resolve(__dirname, "src/content/quizAttempt.ts"),
      quizPreview: resolve(__dirname, "src/content/quizPreview.ts")
    }
  : {
      popup: resolve(__dirname, "index.html"),
      external: resolve(__dirname, "src/background/external.ts")
    };

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __REDUXSHARE_BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  build: {
    outDir: extensionTarget ? resolve(__dirname, "dist", extensionTarget) : "dist",
    // The app pass clears the target directory, the content pass only adds its entries to it.
    emptyOutDir: !contentPass,
    sourcemap: false,
    rollupOptions: {
      input: entryPoints,
      output: {
        entryFileNames: "assets/[name].js",
        // The content pass must inline everything it imports, so it never groups modules into
        // chunks: a named chunk would end up as an ES import in a classic content script.
        manualChunks: contentPass
          ? undefined
          : (id) => {
              if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
                return "vendor-react";
              }

              if (id.includes("node_modules/pocketbase")) {
                return "vendor-pocketbase";
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
