import { expect, test } from "@playwright/test";
import { toggleQaReporting } from "./support/qaReporting";

test("annotation history is shared by the top toolbar, Edit menu, and keyboard", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("annotation-history");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");
  await page.getByRole("button", { name: "Number", exact: true }).click();
  await toggleQaReporting(page);

  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width * .7, bounds!.y + bounds!.height * .5);
  const nextMarker = page.getByLabel("Next marker number");
  await expect(nextMarker).toHaveValue("2");

  await expect(page.locator("#undoButton")).toBeEnabled();
  await page.locator("#undoButton").click();
  await expect(nextMarker).toHaveValue("1");
  await expect(page.locator("#redoButton")).toBeEnabled();
  await page.locator("#redoButton").click();
  await expect(nextMarker).toHaveValue("2");

  await page.locator("#editMenu summary").click();
  await page.locator("#menuUndoButton").click();
  await expect(nextMarker).toHaveValue("1");
  await page.keyboard.press("Control+Shift+Z");
  await expect(nextMarker).toHaveValue("2");
  await page.keyboard.press("Control+Z");
  await expect(nextMarker).toHaveValue("1");
});
