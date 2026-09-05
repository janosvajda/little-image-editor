import { expect, test } from "@playwright/test";

async function createImage(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.locator("#quickNewButton").click();
  await page.locator("#newImageName").fill("annotation-contract");
  await page.locator("#createImageButton").click();
  await page.waitForTimeout(500);
  await page.goto("/?mode=annotate");
  await expect(page.locator(".annotation-panel")).toBeVisible();
}

test("annotation workspace is hidden normally and focused when explicitly requested", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".annotation-panel")).toBeHidden();
  await createImage(page);
  await expect(page.locator("[data-panel=tools]")).toBeVisible();
  const annotations = page.locator('[data-panel="annotations"]');
  await expect(annotations.getByRole("button", { name: "Arrow", exact: true })).toBeVisible();
  await expect(annotations.getByRole("button", { name: "Number", exact: true })).toBeVisible();
  await expect(annotations.getByRole("button", { name: "Blur", exact: true })).toBeVisible();
  await expect(annotations.getByRole("button", { name: "Redact", exact: true })).toBeVisible();
  await expect(annotations.getByRole("button", { name: "Crop", exact: true })).toBeVisible();
});

test("number shortcut places an incrementing sequence and persists it across reload", async ({ page }) => {
  await createImage(page);
  await page.keyboard.press("1");
  await expect(page.locator(".annotation-next-step")).toHaveText("Next marker: 1");
  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width * .6, bounds!.y + bounds!.height * .4);
  await page.mouse.click(bounds!.x + bounds!.width * .72, bounds!.y + bounds!.height * .55);
  await page.mouse.click(bounds!.x + bounds!.width * .82, bounds!.y + bounds!.height * .7);
  await expect(page.locator(".annotation-next-step")).toHaveText("Next marker: 4");
  expect(await page.locator(".annotation-canvas").evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext("2d")!;
    return [...context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data].some(value => value !== 0);
  })).toBe(true);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator(".annotation-next-step")).toHaveText("Next marker: 4");
});

test("all annotation tools switch immediately and crop uses the shared immediate extraction tool", async ({ page }) => {
  await createImage(page);
  const annotations = page.locator('[data-panel="annotations"]');
  for (const tool of ["Select", "Arrow", "Number", "Box", "Highlight", "Text", "Blur", "Redact", "Crop"]) {
    const button = annotations.getByRole("button", { name: tool, exact: true });
    await button.click();
		if (tool === "Crop")
			await expect(page.locator('[data-tool="crop"]')).toHaveClass(/active/);
		else await expect(button).toHaveClass(/active/);
  }
  const overlay = page.locator("#overlay");
  const bounds = await overlay.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width * .55, bounds!.y + bounds!.height * .3);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * .75, bounds!.y + bounds!.height * .6);
  await page.mouse.up();
	await expect(page.getByRole("button", { name: "Apply crop", exact: true })).toHaveCount(0);
	await expect(page.locator('[data-tool="select"]')).toHaveClass(/active/);
});

test("metadata privacy controls change the exact copy preview", async ({ page }) => {
  await createImage(page);
  await page.locator(".annotation-panel input[placeholder='Expected result']").fill("Toolbar remains fixed");
  await page.locator(".annotation-panel input[placeholder='Actual result']").fill("Toolbar moved");
  await expect(page.locator(".annotation-panel textarea")).toHaveValue(/Expected: Toolbar remains fixed/);
  await expect(page.locator(".annotation-panel textarea")).toHaveValue(/Actual: Toolbar moved/);
  await page.getByText("Include environment", { exact: true }).locator("input").uncheck();
  await expect(page.locator(".annotation-panel textarea")).not.toHaveValue(/Browser \/ OS:/);
});
