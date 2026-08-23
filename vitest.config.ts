import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/app/**/*.ts"],
      exclude: ["src/app/models/appTypes.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        statements: 90, branches: 80, functions: 90, lines: 95,
        "src/app/ui/**.ts": { lines: 95, perFile: true }
      }
    }
  }
});
