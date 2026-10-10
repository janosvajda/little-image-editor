import { describe, expect, it } from "vitest";
import { formatBugReport } from "./bugReportMetadata";

describe("bug report capture details", () => {
  const source = { url: "https://private.example/issues/42", capturedAt: "2026-08-23T12:00:00.000Z", userAgent: "Test Browser / Test OS", viewport: { width: 1280, height: 720 } };

  it("lists the captured source page, environment and screenshot size", () => {
    const report = formatBugReport({ source, screenshot: { width: 1000, height: 600 }, expected: "A", actual: "B" });
    expect(report).toContain("- Source page: <https://private.example/issues/42>");
    expect(report).toContain("- Viewport: 1280 × 720 px");
    expect(report).toContain("- Screenshot: 1000 × 600 px");
  });

  it("writes no source lines when no source was captured", () => {
    const report = formatBugReport({ screenshot: { width: 10, height: 20 }, expected: "", actual: "" });
    expect(report).not.toContain(source.url);
    expect(report).not.toContain(source.userAgent);
    expect(report).toContain("- Screenshot: 10 × 20 px");
  });
});
