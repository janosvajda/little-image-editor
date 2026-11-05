const unavailableExitCode = 1;

console.error("Browser E2E tests are unavailable: Playwright and its testing browsers have been temporarily removed. The preserved E2E tests have not been run.");
process.exitCode = unavailableExitCode;
