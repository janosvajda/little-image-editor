import { defineConfig } from "@playwright/test";

const port = Number(process.env.LITTLE_EDITOR_E2E_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `LITTLE_EDITOR_PORT=${port} node scripts/build.mjs --serve`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
