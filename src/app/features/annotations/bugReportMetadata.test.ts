import { describe, expect, it } from "vitest";
import { formatBugReport } from "./bugReportMetadata";

describe("bug report privacy preview", () => {
  const source = { url: "https://private.example/issues/42", capturedAt: "2026-08-23T12:00:00.000Z", userAgent: "Test Browser / Test OS", viewport: { width: 1280, height: 720 } };

  it("shows exactly the metadata selected for copying", () => {
    const report = formatBugReport({ source, screenshot: { width: 1000, height: 600 }, expected: "A", actual: "B", includeUrl: true, includeEnvironment: true });
    expect(report).toContain("Page: https://private.example/issues/42");
    expect(report).toContain("Viewport: 1280 × 720 px");
    expect(report).toContain("Screenshot: 1000 × 600 px");
  });

  it("omits private URL and environment when their preview controls are disabled", () => {
    const report = formatBugReport({ source, screenshot: { width: 10, height: 20 }, expected: "", actual: "", includeUrl: false, includeEnvironment: false });
    expect(report).not.toContain(source.url);
    expect(report).not.toContain(source.userAgent);
    expect(report).toContain("Screenshot: 10 × 20 px");
  });
});
