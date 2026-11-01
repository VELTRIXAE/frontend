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
    coverage: { reporter: ["text", "json", "html"], include: ["components/**/*.{ts,tsx}", "lib/**/*.ts"] },
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
});
