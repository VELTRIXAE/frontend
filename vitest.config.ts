import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["components/**/*.{ts,tsx}", "lib/**/*.ts"],
      thresholds: { statements: 20, branches: 15, functions: 20, lines: 20 },
    },
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});
