import { expect, test } from "@playwright/test";

test("selecting the active brush takes canvas control from annotation Highlight", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("cross-toolbar-ownership");
  await page.locator("#createImageButton").click();
  await page.locator("#toolbarPickerButton").click();
  await page.locator('[data-panel-toggle="annotations"]').check();
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.locator("#toolbarPickerButton").click();
  const toolsToggle = page.locator('[data-panel-toggle="tools"]');
  if (!(await toolsToggle.isChecked())) await toolsToggle.check();
  await page.getByRole("button", { name: "Brush tools: Brush", exact: true }).evaluate(button => (button as HTMLButtonElement).click());

  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width * .65, bounds!.y + bounds!.height * .45);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * .8, bounds!.y + bounds!.height * .6);
  await page.mouse.up();

  await expect(page.locator("body")).not.toHaveClass(/annotation-mode/);
  const painted = await page.locator("#canvas").evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext("2d")!;
    return [...context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data]
      .some((value, index) => index % 4 === 3 && value > 0);
  });
  expect(painted).toBe(true);
});
