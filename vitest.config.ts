import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // JSX wie in Next.js (ohne import React)
  esbuild: { jsx: "automatic" },
  test: { include: ["src/**/*.test.ts"] },
});
