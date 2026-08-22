import { expect, test } from "@playwright/test";

test("creates and edits a new image", async ({ page }) => {
  await page.goto("/");
  await page.getByTitle("New image (Ctrl/⌘ N)").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Preset").selectOption("1280x720");
  await page.getByRole("button", { name: "Create image" }).click();
  await expect(page.locator("#dimensions")).toHaveText("1280 × 720 px");
  await expect(page.locator("#canvasWrap")).toBeVisible();
  await page.getByRole("button", { name: "Invert" }).click();
  await expect(page.locator("#undoButton")).toBeEnabled();
});

test("navigates menus and opens functions with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+f" : "Control+f");
  await expect(page.locator("#fileMenu")).toHaveAttribute("open", "");
  await page.locator("#newImageButton").press("ArrowRight");
  await expect(page.locator("#editMenu")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await page.getByTitle("Image functions").click();
  await expect(page.getByText("Sprite sheet", { exact: true })).toBeVisible();
});
