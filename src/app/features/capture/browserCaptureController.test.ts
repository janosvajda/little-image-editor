import { beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSER_CAPTURE_MENU_IDS, BrowserCaptureController } from "./browserCaptureController";
import type { BrowserCapturePlatform, BrowserContextMenu, BrowserMenuClick, BrowserTab } from "./browserCapturePlatform";
import { locateRenderedImage, readPageViewport, selectPageRegion } from "./browserPageCapture";
import { ChromeCapturePlatform } from "./chromeCapturePlatform";

class TestCapturePlatform implements BrowserCapturePlatform {
  actionListener?: (tab: BrowserTab) => void;
  menuListener?: (info: BrowserMenuClick, tab?: BrowserTab) => void;
  commandListener?: (command: string, tab?: BrowserTab) => void;
  readonly replaceContextMenus = vi.fn<(items: BrowserContextMenu[]) => Promise<void>>().mockResolvedValue(undefined);
  readonly captureVisibleTab = vi.fn<(windowId: number) => Promise<Blob>>().mockResolvedValue(new Blob(["capture"], { type: "image/png" }));
  readonly openTab = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
  readonly executeInTab = vi.fn<BrowserCapturePlatform["executeInTab"]>();
  readonly extensionUrl = vi.fn((path: string) => `chrome-extension://test/${path}`);
  readonly createId = vi.fn(() => "capture-id");

  onAction(listener: (tab: BrowserTab) => void): void { this.actionListener = listener; }
  onContextMenu(listener: (info: BrowserMenuClick, tab?: BrowserTab) => void): void { this.menuListener = listener; }
  onCommand(listener: (command: string, tab?: BrowserTab) => void): void { this.commandListener = listener; }
}

describe("browser capture background controller", () => {
  let platform: TestCapturePlatform;
  let put: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    platform = new TestCapturePlatform();
    put = vi.fn().mockResolvedValue(undefined);
    await new BrowserCaptureController(platform, { put }).start();
  });

  it("registers the extension action, commands, and three scoped context menus", () => {
    expect(platform.actionListener).toBeTypeOf("function");
    expect(platform.menuListener).toBeTypeOf("function");
    expect(platform.commandListener).toBeTypeOf("function");
    expect(platform.replaceContextMenus).toHaveBeenCalledWith([
      { id: "edit-image", title: "Edit in Little Image Editor", contexts: ["image"] },
      { id: "capture-page", title: "Capture visible area", contexts: ["page"] },
      { id: "capture-region", title: "Capture selected region", contexts: ["page", "image"] }
    ]);
  });

  it("opens the editor directly from the extension action", async () => {
    platform.actionListener!({ id: 4, windowId: 8 });
    await vi.waitFor(() => expect(platform.openTab).toHaveBeenCalledWith("chrome-extension://test/editor.html"));
    expect(platform.captureVisibleTab).not.toHaveBeenCalled();
  });

  it("captures and stores the visible page before opening its editor tab", async () => {
    platform.executeInTab.mockResolvedValueOnce({ width: 1200, height: 800 });
    platform.menuListener!({ menuItemId: BROWSER_CAPTURE_MENU_IDS.capturePage }, { id: 4, windowId: 8 });

    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(platform.executeInTab.mock.calls[0]?.[0]).toBe(4);
    expect(platform.executeInTab.mock.calls[0]?.[1]).toBe(readPageViewport);
    expect(platform.captureVisibleTab).toHaveBeenCalledWith(8);
    expect(put).toHaveBeenCalledWith("capture-id", expect.objectContaining({
      blob: expect.any(Blob), name: expect.stringMatching(/^page-capture-.*\.png$/), viewport: { width: 1200, height: 800 }
    }));
    expect(platform.openTab).toHaveBeenCalledWith("chrome-extension://test/editor.html?capture=capture-id");
  });

  it("routes image context clicks and the region shortcut through their page functions", async () => {
    const geometry = { crop: { x: 10, y: 20, width: 30, height: 40 }, viewport: { width: 100, height: 100 } };
    platform.executeInTab.mockResolvedValueOnce(geometry).mockResolvedValueOnce(geometry);
    platform.menuListener!({ menuItemId: BROWSER_CAPTURE_MENU_IDS.editImage, srcUrl: "https://example.test/image.png" }, { id: 2, windowId: 3 });
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(platform.executeInTab.mock.calls[0]?.[1]).toBe(locateRenderedImage);
    expect(platform.executeInTab.mock.calls[0]?.[2]).toEqual(["https://example.test/image.png"]);

    platform.commandListener!("capture-selected-region", { id: 2, windowId: 3 });
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(platform.executeInTab.mock.calls[1]?.[1]).toBe(selectPageRegion);
    expect(put.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ name: expect.stringMatching(/^region-capture-/), ...geometry }));
  });

  it("does nothing for incomplete, cancelled, or unrelated capture events", async () => {
    platform.menuListener!({ menuItemId: BROWSER_CAPTURE_MENU_IDS.editImage }, { id: 2, windowId: 3 });
    platform.menuListener!({ menuItemId: "unknown" }, { id: 2, windowId: 3 });
    platform.commandListener!("unknown", { id: 2, windowId: 3 });
    platform.commandListener!("capture-selected-region", {});
    platform.executeInTab.mockResolvedValueOnce(null).mockResolvedValueOnce({ width: 100, height: 100 });
    platform.menuListener!({ menuItemId: BROWSER_CAPTURE_MENU_IDS.capturePage }, { id: 2, windowId: 3 });
    platform.menuListener!({ menuItemId: BROWSER_CAPTURE_MENU_IDS.capturePage }, { id: 2 });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(platform.captureVisibleTab).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("injected browser page capture UI", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => { callback(0); return 1; } });
  });

  it("reads the viewport and locates the largest visible matching image", () => {
    const small = document.createElement("img");
    const large = document.createElement("img");
    small.src = large.src = "https://example.test/image.png";
    small.getBoundingClientRect = () => ({ left: 5, top: 10, right: 25, bottom: 30, width: 20, height: 20, x: 5, y: 10, toJSON: vi.fn() });
    large.getBoundingClientRect = () => ({ left: -10, top: 20, right: 300, bottom: 220, width: 310, height: 200, x: -10, y: 20, toJSON: vi.fn() });
    document.body.append(small, large);
    expect(readPageViewport()).toEqual({ width: 800, height: 600 });
    expect(locateRenderedImage(large.src)).toEqual({
      crop: { x: 0, y: 20, width: 300, height: 200 }, viewport: { width: 800, height: 600 }
    });
    expect(locateRenderedImage("https://example.test/missing.png")).toBeNull();
  });

  it("returns a dragged region and removes its temporary overlay", async () => {
    const result = selectPageRegion();
    const overlay = document.documentElement.lastElementChild as HTMLElement;
    overlay.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 120, clientY: 100 }));
    overlay.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 30 }));
    overlay.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 30 }));
    await expect(result).resolves.toEqual({
      crop: { x: 40, y: 30, width: 80, height: 70 }, viewport: { width: 800, height: 600 }
    });
    expect(overlay.isConnected).toBe(false);
  });

  it("cancels region selection with Escape", async () => {
    const result = selectPageRegion();
    const overlay = document.documentElement.lastElementChild as HTMLElement;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await expect(result).resolves.toBeNull();
    expect(overlay.isConnected).toBe(false);
  });
});

describe("Chrome capture platform adapter", () => {
  it("delegates browser events, menus, scripts, screenshots, and tabs to Chrome", async () => {
    const addAction = vi.fn(), addMenu = vi.fn(), addCommand = vi.fn();
    const createMenu = vi.fn(), removeAll = vi.fn().mockResolvedValue(undefined);
    const executeScript = vi.fn().mockResolvedValue([{ frameId: 0, result: { width: 10, height: 20 } }]);
    const captureVisibleTab = vi.fn().mockResolvedValue("data:image/png;base64,cG5n");
    const createTab = vi.fn().mockResolvedValue({});
    const getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    Object.defineProperty(globalThis, "chrome", { configurable: true, value: {
      action: { onClicked: { addListener: addAction } },
      contextMenus: { onClicked: { addListener: addMenu }, create: createMenu, removeAll },
      commands: { onCommand: { addListener: addCommand } },
      scripting: { executeScript }, tabs: { captureVisibleTab, create: createTab }, runtime: { getURL }
    } });
    const blob = new Blob(["png"], { type: "image/png" });
    const fetchImage = vi.spyOn(globalThis, "fetch").mockResolvedValue({ blob: async () => blob } as Response);
    const platform = new ChromeCapturePlatform();
    const listener = vi.fn();

    platform.onAction(listener); platform.onContextMenu(listener); platform.onCommand(listener);
    expect(addAction).toHaveBeenCalledWith(listener);
    expect(addMenu).toHaveBeenCalledWith(listener);
    expect(addCommand).toHaveBeenCalledWith(listener);
    await platform.replaceContextMenus([{ id: "capture", title: "Capture", contexts: ["page"] }]);
    expect(removeAll).toHaveBeenCalledOnce();
    expect(createMenu).toHaveBeenCalledWith({ id: "capture", title: "Capture", contexts: ["page"] });

    const pageFunction = () => ({ width: 10, height: 20 });
    await expect(platform.executeInTab(5, pageFunction, [])).resolves.toEqual({ width: 10, height: 20 });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 5 }, func: pageFunction, args: [] });
    executeScript.mockRejectedValueOnce(new Error("restricted page"));
    await expect(platform.executeInTab(5, pageFunction, [])).resolves.toBeNull();

    await expect(platform.captureVisibleTab(7)).resolves.toBe(blob);
    expect(captureVisibleTab).toHaveBeenCalledWith(7, { format: "png" });
    expect(fetchImage).toHaveBeenCalledWith("data:image/png;base64,cG5n");
    await platform.openTab("chrome-extension://test/editor.html");
    expect(createTab).toHaveBeenCalledWith({ url: "chrome-extension://test/editor.html" });
    expect(platform.extensionUrl("editor.html")).toBe("chrome-extension://test/editor.html");
    expect(platform.createId()).toMatch(/[0-9a-f-]{20,}/i);
    fetchImage.mockRestore();
  });
});
