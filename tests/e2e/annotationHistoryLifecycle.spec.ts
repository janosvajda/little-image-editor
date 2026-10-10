import { expect, test } from "@playwright/test";
import { toggleQaReporting } from "./support/qaReporting";

async function openAnnotationImage(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("annotation-history-lifecycle");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");
  await page.getByRole("button", { name: "Number", exact: true }).click();
  await toggleQaReporting(page);
}

async function placeMarker(page: import("@playwright/test").Page, fraction: number): Promise<void> {
  const bounds = await page.locator("#overlay").boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width * fraction, bounds!.y + bounds!.height * .5);
}

test("annotation undo and redo history survives an accidental reload", async ({ page }) => {
  await openAnnotationImage(page);
  await placeMarker(page, .65);
  await placeMarker(page, .75);
  await expect(page.getByLabel("Next marker number")).toHaveValue("3");
  await page.waitForTimeout(700);
  await page.reload();

  await expect(page.locator("#undoButton")).toBeEnabled();
  await page.locator("#undoButton").click();
  await expect(page.getByLabel("Next marker number")).toHaveValue("2");
  await page.locator("#redoButton").click();
  await expect(page.getByLabel("Next marker number")).toHaveValue("3");
});

test("main history follows the most recent image or annotation operation", async ({ page }) => {
  await openAnnotationImage(page);
  await placeMarker(page, .7);
  await expect(page.getByLabel("Next marker number")).toHaveValue("2");

  await page.locator("#toolbarPickerButton").click();
  await page.locator('[data-panel-toggle="adjust"]').check();
  const brightness = page.locator("#brightnessInput");
  const before = await page.locator("#canvas").evaluate(canvas => (canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[0]);
  await brightness.evaluate(input => {
    input.value = "-50";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const adjusted = await page.locator("#canvas").evaluate(canvas => (canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[0]);
  expect(adjusted).not.toBe(before);

  await page.locator("#undoButton").click();
  await expect(page.getByLabel("Next marker number")).toHaveValue("2");
  expect(await page.locator("#canvas").evaluate(canvas => (canvas as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[0])).toBe(before);

  await placeMarker(page, .8);
  await expect(page.getByLabel("Next marker number")).toHaveValue("3");
  await page.locator("#undoButton").click();
  await expect(page.getByLabel("Next marker number")).toHaveValue("2");
});
