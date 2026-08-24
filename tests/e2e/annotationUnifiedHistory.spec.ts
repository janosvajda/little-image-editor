import { expect, test } from "@playwright/test";

test("annotation history is shared by its panel, top toolbar, Edit menu, and keyboard", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("annotation-history");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");
  await page.getByRole("button", { name: "Number", exact: true }).click();

  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width * .7, bounds!.y + bounds!.height * .5);
  const nextMarker = page.locator(".annotation-next-step");
  await expect(nextMarker).toHaveText("Next marker: 2");

  await expect(page.locator("#undoButton")).toBeEnabled();
  await page.locator("#undoButton").click();
  await expect(nextMarker).toHaveText("Next marker: 1");
  await expect(page.locator("#redoButton")).toBeEnabled();
  await page.locator("#redoButton").click();
  await expect(nextMarker).toHaveText("Next marker: 2");

  await page.getByRole("button", { name: "Undo annotation" }).click();
  await expect(nextMarker).toHaveText("Next marker: 1");
  await page.getByRole("button", { name: "Redo annotation" }).click();
  await expect(nextMarker).toHaveText("Next marker: 2");

  await page.locator("#editMenu summary").click();
  await page.locator("#menuUndoButton").click();
  await expect(nextMarker).toHaveText("Next marker: 1");
  await page.keyboard.press("Control+Shift+Z");
  await expect(nextMarker).toHaveText("Next marker: 2");
  await page.keyboard.press("Control+Z");
  await expect(nextMarker).toHaveText("Next marker: 1");
});
