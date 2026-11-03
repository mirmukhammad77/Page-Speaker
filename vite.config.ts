import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const content = mode === "content";
  return {
    plugins: content ? [react(), tailwindcss()] : [],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    publicDir: content ? "public" : false,
    build: {
      target: "chrome120",
      outDir: "dist",
      emptyOutDir: content,
      sourcemap: false,
      lib: {
        entry: fileURLToPath(new URL(content ? "./src/content/index.tsx" : "./src/background/index.ts", import.meta.url)),
        name: content ? "PageSpeaker" : undefined,
        formats: content ? ["iife"] : ["es"],
        fileName: () => content ? "content.js" : "background.js",
      },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  };
});
