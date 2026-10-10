import { describe, expect, it, vi } from "vitest";
import { BROWSER_CAPTURE_MENU_IDS, BrowserCaptureController } from "./browserCaptureController";
import { readCaptureSource } from "./browserPageCapture";
import { QA_REPORTING_TITLE } from "../annotations/bugReportMetadata";
import type { BrowserCapturePlatform, BrowserContextMenu, BrowserMenuClick, BrowserTab } from "./browserCapturePlatform";

class Platform implements BrowserCapturePlatform {
  menu?: (info: BrowserMenuClick, tab?: BrowserTab) => void;
  replaceContextMenus = vi.fn<(items: BrowserContextMenu[]) => Promise<void>>().mockResolvedValue(undefined);
  executeInTab = vi.fn<BrowserCapturePlatform["executeInTab"]>().mockResolvedValue({ url: "https://example.test/bug", capturedAt: "2026-08-23T12:00:00Z", userAgent: "Browser OS", viewport: { width: 1200, height: 800 } });
  captureVisibleTab = vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/png" }));
  openTab = vi.fn().mockResolvedValue(undefined);
  extensionUrl = (path: string) => `chrome-extension://test/${path}`;
  createId = () => "bug-id";
  onAction(): void {}
  onCommand(): void {}
  onContextMenu(listener: (info: BrowserMenuClick, tab?: BrowserTab) => void): void { this.menu = listener; }
}

describe("bug-report screenshot context workflow", () => {
  it("installs the fourth menu and opens the captured screenshot in annotation mode with metadata", async () => {
    const platform = new Platform();
    const put = vi.fn().mockResolvedValue(undefined);
    await new BrowserCaptureController(platform, { put }).start();
    expect(platform.replaceContextMenus).toHaveBeenLastCalledWith(expect.arrayContaining([
      { id: BROWSER_CAPTURE_MENU_IDS.bugReport, title: QA_REPORTING_TITLE, contexts: ["page", "image"] }
    ]));
    platform.menu!({ menuItemId: BROWSER_CAPTURE_MENU_IDS.bugReport }, { id: 3, windowId: 7 });
    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(platform.executeInTab.mock.calls[0]?.[1]).toBe(readCaptureSource);
    expect(put).toHaveBeenCalledWith("bug-id", expect.objectContaining({ name: expect.stringMatching(/^bug-report-capture-/), source: expect.objectContaining({ url: "https://example.test/bug" }) }));
    expect(platform.openTab).toHaveBeenCalledWith("chrome-extension://test/editor.html?capture=bug-id&mode=annotate");
  });
});
