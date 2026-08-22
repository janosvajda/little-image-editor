import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/app/**/*.ts"],
      exclude: ["src/app/types.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: { statements: 85, branches: 70, functions: 85, lines: 95 }
    }
  }
});
