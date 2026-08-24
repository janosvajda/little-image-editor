import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const imageBase64 = readFileSync("src/assets/images/extensionIcon.png").toString("base64");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class TestClipboardItem {
      constructor(readonly items: Record<string, Blob>) {}
    }
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: TestClipboardItem });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: async (items: ClipboardItem[]) => { (window as unknown as { copiedItems: ClipboardItem[] }).copiedItems = items; } }
    });
  });
});

test("pastes an image into the editor and copies the edited canvas back to the clipboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#copyImageButton")).toBeDisabled();
  await expect(page.locator("#quickCopyButton")).toBeDisabled();

  await page.evaluate(base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "clipboard-image.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
  }, imageBase64);

  await expect(page.locator("#canvasWrap")).toBeVisible();
  await expect(page.locator("#dimensions")).not.toHaveText("No image");
  await expect(page.locator("#copyImageButton")).toBeEnabled();
  await expect(page.locator("#quickCopyButton")).toBeEnabled();

  await page.locator("#quickCopyButton").click();
  await expect(page.locator("#clipboardStatus")).toHaveText("Image copied to clipboard.");
  await expect(page.locator("#clipboardStatus")).toHaveClass(/visible/);
  expect(await page.evaluate(() => (window as unknown as { copiedItems?: ClipboardItem[] }).copiedItems?.length)).toBe(1);
});

test("exposes the copy command in the File menu and supports its keyboard shortcut", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.getByLabel("Image name").fill("clipboard-test");
  await page.getByRole("button", { name: "Create image" }).click();

  await page.locator("#fileMenu summary").click();
  await expect(page.getByRole("menuitem", { name: /Copy image/ })).toBeVisible();
  await page.keyboard.press("Control+C");
  await expect(page.locator("#clipboardStatus")).toHaveText("Image copied to clipboard.");
});
